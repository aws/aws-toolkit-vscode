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
    DeserializeHandler,
    DeserializeHandlerOptions,
    DeserializeMiddleware,
    HandlerExecutionContext,
    Provider,
    UserAgent,
} from '@aws-sdk/types'
import { HttpResponse } from '@aws-sdk/protocol-http'
import { telemetry } from './telemetry'
import { getRequestId } from './errors'
import { getLogger } from '.'

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
            opt.customUserAgent = [[getUserAgent({ includePlatform: true, includeClientId: true })]]
        }

        const apiConfig = (opt as { apiConfig?: { metadata?: Record<string, string> } } | undefined)?.apiConfig
        const serviceName =
            apiConfig?.metadata?.serviceId?.toLowerCase() ??
            (type as unknown as { serviceIdentifier?: string }).serviceIdentifier

        if (serviceName) {
            opt.endpoint = settings?.get('endpoints', {})[serviceName] ?? opt.endpoint
        }
        opt.credentials = async () => {
            const creds = await shim.get()
            if (creds.expiration && creds.expiration.getTime() < Date.now()) {
                return shim.refresh()
            }
            return creds
        }

        const service = new type(opt)
        service.middlewareStack.add(telemetryMiddleware, { step: 'deserialize' } as DeserializeHandlerOptions)
        return service
    }
}

function getServiceId(context: { clientName?: string; commandName?: string }) {
    return context.clientName?.toLowerCase().replace(/client$/, '')
}

function isExcludedError(e: Error, ignoredErrors: (string | typeof Error)[]) {
    return (
        ignoredErrors?.find((x) => e.name === x) ||
        ('code' in e && ignoredErrors?.find((x) => e.code === x)) ||
        ignoredErrors?.find((x) => typeof x !== 'string' && e instanceof x)
    )
}
/**
 * Record request IDs to the current context, potentially overriding the field if
 * multiple API calls are made in the same context. We only do failures as successes are generally uninteresting and noisy.
 */
function recordErrorTelemetry(err: Error, serviceName?: string) {
    interface RequestData {
        requestId?: string
        requestServiceType?: string
    }

    telemetry.record({
        requestId: getRequestId(err),
        requestServiceType: serviceName,
    } satisfies RequestData as any)
}

function omitIfPresent<T extends Record<string, unknown>>(obj: T, keys: string[]): T {
    const objCopy = { ...obj }
    for (const key of keys) {
        if (key in objCopy) {
            ;(objCopy as any)[key] = '[omitted]'
        }
    }
    return objCopy
}

const telemetryMiddleware: DeserializeMiddleware<any, any> =
    (next: DeserializeHandler<any, any>, context: HandlerExecutionContext) => async (args: any) => {
        if (!HttpResponse.isInstance(args.request)) {
            return next(args)
        }

        const { hostname, path } = args.request
        const result = await next(args).catch((e: any) => {
            if (e instanceof Error && !isExcludedError(e, [])) {
                recordErrorTelemetry(e, getServiceId(context as object))
                const err = { ...e }
                delete err['stack']
                getLogger().error('API Response (%s %s): %O', hostname, path, err)
            }
            throw e
        })
        if (HttpResponse.isInstance(result.response)) {
            const output = omitIfPresent(result.output, [])
            getLogger().debug('API Response (%s %s): %O', hostname, path, output)
        }

        return result
    }
