/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CredentialsShim } from '../auth/deprecated/loginManager'
import { AwsContext } from './awsContext'
import { AwsCredentialIdentityProvider, RetryStrategyV2 } from '@smithy/types'
import { getUserAgent } from './telemetry/util'
import { DevSettings } from './settings'
import {
    DeserializeHandler,
    DeserializeHandlerOptions,
    DeserializeMiddleware,
    HandlerExecutionContext,
    Provider,
    RetryStrategy,
    UserAgent,
} from '@aws-sdk/types'
import { HttpResponse } from '@aws-sdk/protocol-http'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'
import { telemetry } from './telemetry'
import { getRequestId, getTelemetryReason, getTelemetryReasonDesc, getTelemetryResult } from './errors'
import { extensionVersion } from '.'
import { getLogger } from './logger'
import { omitIfPresent } from './utilities/tsUtils'

export type AwsClientConstructor<C> = new (o: AwsClientOptions) => C

interface AwsClient {
    middlewareStack: any // Ideally this would extends MiddlewareStack<Input, Output>, but this causes issues on client construction.
}

interface AwsConfigOptions {
    credentials: AwsCredentialIdentityProvider
    region: string | Provider<string>
    customUserAgent: UserAgent
    requestHandler: any
    apiVersion: string
    endpoint: string
    retryStrategy: RetryStrategy | RetryStrategyV2
}
export type AwsClientOptions = AwsConfigOptions

export class AWSClientBuilderV3 {
    public constructor(private readonly context: AwsContext) {}

    private getShim(): CredentialsShim {
        const shim = this.context.credentialsShim
        if (!shim) {
            throw new Error('Toolkit is not logged-in.')
        }
        return shim
    }

    public async createAwsService<C extends AwsClient>(
        type: AwsClientConstructor<C>,
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

        if (!opt.retryStrategy) {
            // Simple exponential backoff strategy as default.
            opt.retryStrategy = new ConfiguredRetryStrategy(5, (attempt: number) => 1000 * 2 ** attempt)
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
        // TODO: add middleware for logging, telemetry, endpoints.
        service.middlewareStack.add(telemetryMiddleware, { step: 'deserialize' } as DeserializeHandlerOptions)
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
    telemetry.record({
        requestId: getRequestId(err),
        requestServiceType: serviceName,
        reasonDesc: getTelemetryReasonDesc(err),
        reason: getTelemetryReason(err),
        result: getTelemetryResult(err),
    })
}

function logAndThrow(e: any, serviceId: string, errorMessageAppend: string): never {
    if (e instanceof Error) {
        recordErrorTelemetry(e, serviceId)
        const err = { ...e }
        delete err['stack']
        getLogger().error('API Response %s: %O', errorMessageAppend, err)
    }
    throw e
}
/**
 * Telemetry logic to be added to all created clients. Adds logging and emitting metric on errors.
 */

const telemetryMiddleware: DeserializeMiddleware<any, any> =
    (next: DeserializeHandler<any, any>, context: HandlerExecutionContext) => async (args: any) => {
        if (!HttpResponse.isInstance(args.request)) {
            return next(args)
        }
        const serviceId = getServiceId(context as object)
        const { hostname, path } = args.request
        const logTail = `(${hostname} ${path})`
        const result = await next(args).catch((e: any) => logAndThrow(e, serviceId, logTail))
        if (HttpResponse.isInstance(result.response)) {
            // TODO: omit credentials / sensitive info from the logs / telemetry.
            const output = omitIfPresent(result.output, [])
            getLogger().debug('API Response %s: %O', logTail, output)
        }

        return result
    }
