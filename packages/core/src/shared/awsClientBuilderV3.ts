/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CredentialsShim } from '../auth/deprecated/loginManager'
import { AwsContext } from './awsContext'
import { AwsCredentialIdentityProvider } from '@smithy/types'
import { Client as IClient } from '@smithy/types'
import { getUserAgent } from './telemetry/util'
import { DevSettings } from './settings'
import {
    BuildHandler,
    BuildMiddleware,
    DeserializeHandler,
    DeserializeMiddleware,
    FinalizeHandler,
    FinalizeRequestMiddleware,
    HandlerExecutionContext,
    Provider,
    UserAgent,
} from '@aws-sdk/types'
import { HttpRequest, HttpResponse } from '@aws-sdk/protocol-http'
import { telemetry } from './telemetry'
import { getRequestId } from './errors'
import { extensionVersion } from '.'
import { getLogger } from './logger'
import { omitIfPresent, selectFrom } from './utilities/tsUtils'

export type AwsClient = IClient<any, any, any>
interface AwsConfigOptions {
    credentials: AwsCredentialIdentityProvider
    region: string | Provider<string>
    customUserAgent: UserAgent
    requestHandler: any
    apiVersion: string
    endpoint: string
}
export type AwsClientOptions = AwsConfigOptions

export interface AWSClientBuilderV3 {
    createAwsService<C extends AwsClient>(
        type: new (o: AwsClientOptions) => C,
        options?: Partial<AwsClientOptions>,
        region?: string,
        userAgent?: boolean,
        settings?: DevSettings
    ): Promise<C>
}

export class DefaultAWSClientBuilderV3 implements AWSClientBuilderV3 {
    public constructor(private readonly context: AwsContext) {}

    private getShim(): CredentialsShim {
        const shim = this.context.credentialsShim
        if (!shim) {
            throw new Error('Toolkit is not logged-in.')
        }
        return shim
    }

    public async createAwsService<C extends AwsClient>(
        type: new (o: AwsClientOptions) => C,
        options?: Partial<AwsClientOptions>,
        region?: string,
        userAgent: boolean = true,
        settings?: DevSettings
    ): Promise<C> {
        const shim = this.getShim()
        const opt = (options ?? {}) as AwsClientOptions

        if (!opt.region && region) {
            opt.region = region
        }

        if (!opt.customUserAgent && userAgent) {
            opt.customUserAgent = [[getUserAgent({ includePlatform: true, includeClientId: true }), extensionVersion]]
        }
        // TODO: add tests for refresh logic.
        opt.credentials = async () => {
            const creds = await shim.get()
            if (creds.expiration && creds.expiration.getTime() < Date.now()) {
                return shim.refresh()
            }
            return creds
        }

        const service = new type(opt)
        service.middlewareStack.add(telemetryMiddleware, { step: 'deserialize' })
        service.middlewareStack.add(loggingMiddleware, { step: 'finalizeRequest' })
        service.middlewareStack.add(getEndpointMiddleware(settings), { step: 'build' })
        return service
    }
}

export function getServiceId(context: { clientName?: string; commandName?: string }): string {
    return context.clientName?.toLowerCase().replace(/client$/, '') ?? 'unknown-service'
}

/**
 * Record request IDs to the current context, potentially overriding the field if
 * multiple API calls are made in the same context. We only do failures as successes are generally uninteresting and noisy.
 */
export function recordErrorTelemetry(err: Error, serviceName?: string) {
    interface RequestData {
        requestId?: string
        requestServiceType?: string
    }

    const requestId = getRequestId(err)

    telemetry.record({
        requestId: requestId,
        requestServiceType: serviceName,
    } satisfies RequestData as any)
}

function logAndThrow(e: any, serviceId: string, errorMessageAppend: string): never {
    if (e instanceof Error) {
        recordErrorTelemetry(e, serviceId)
        getLogger().error('API Response %s: %O', errorMessageAppend, e)
    }
    throw e
}

const telemetryMiddleware: DeserializeMiddleware<any, any> =
    (next: DeserializeHandler<any, any>, context: HandlerExecutionContext) => async (args: any) =>
        emitOnRequest(next, context, args)

const loggingMiddleware: FinalizeRequestMiddleware<any, any> = (next: FinalizeHandler<any, any>) => async (args: any) =>
    logOnRequest(next, args)

function getEndpointMiddleware(settings: DevSettings = DevSettings.instance): BuildMiddleware<any, any> {
    return (next: BuildHandler<any, any>, context: HandlerExecutionContext) => async (args: any) =>
        overwriteEndpoint(next, context, settings, args)
}

export async function emitOnRequest(next: DeserializeHandler<any, any>, context: HandlerExecutionContext, args: any) {
    if (!HttpResponse.isInstance(args.request)) {
        return next(args)
    }
    const serviceId = getServiceId(context as object)
    const { hostname, path } = args.request
    const logTail = `(${hostname} ${path})`
    try {
        const result = await next(args)
        if (HttpResponse.isInstance(result.response)) {
            // TODO: omit credentials / sensitive info from the telemetry.
            const output = omitIfPresent(result.output, [])
            getLogger().debug(`API Response %s: %O`, logTail, output)
        }
        return result
    } catch (e: any) {
        logAndThrow(e, serviceId, logTail)
    }
}

export async function logOnRequest(next: FinalizeHandler<any, any>, args: any) {
    if (HttpRequest.isInstance(args.request)) {
        const { hostname, path } = args.request
        // TODO: omit credentials / sensitive info from the logs.
        const input = omitIfPresent(args.input, [])
        getLogger().debug(`API Request (%s %s): %O`, hostname, path, input)
    }
    return next(args)
}

export function overwriteEndpoint(
    next: BuildHandler<any, any>,
    context: HandlerExecutionContext,
    settings: DevSettings,
    args: any
) {
    if (HttpRequest.isInstance(args.request)) {
        const serviceId = getServiceId(context as object)
        const endpoint = serviceId ? settings.get('endpoints', {})[serviceId] : undefined
        if (endpoint) {
            const url = new URL(endpoint)
            Object.assign(args.request, selectFrom(url, 'hostname', 'port', 'protocol', 'pathname'))
            args.request.path = args.request.pathname
        }
    }
    return next(args)
}
