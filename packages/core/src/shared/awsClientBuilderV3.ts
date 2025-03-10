/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CredentialsShim } from '../auth/deprecated/loginManager'
import { AwsContext } from './awsContext'
import {
    AwsCredentialIdentityProvider,
    Logger,
    RetryStrategyV2,
    TokenIdentity,
    TokenIdentityProvider,
} from '@smithy/types'
import { getUserAgent } from './telemetry/util'
import { DevSettings } from './settings'
import {
    BuildHandler,
    BuildMiddleware,
    DeserializeHandler,
    DeserializeMiddleware,
    Handler,
    FinalizeHandler,
    FinalizeRequestMiddleware,
    HandlerExecutionContext,
    MetadataBearer,
    MiddlewareStack,
    Provider,
    RequestHandlerMetadata,
    RequestHandlerOutput,
    RetryStrategy,
    UserAgent,
} from '@aws-sdk/types'
import { FetchHttpHandler } from '@smithy/fetch-http-handler'
import { HttpResponse, HttpRequest } from '@aws-sdk/protocol-http'
import { ConfiguredRetryStrategy } from '@smithy/util-retry'
import { telemetry } from './telemetry/telemetry'
import { getRequestId, getTelemetryReason, getTelemetryReasonDesc, getTelemetryResult } from './errors'
import { extensionVersion } from './vscode/env'
import { getLogger } from './logger/logger'
import { partialClone } from './utilities/collectionUtils'
import { selectFrom } from './utilities/tsUtils'
import { once } from './utilities/functionUtils'
import { isWeb } from './extensionGlobals'

export type AwsClientConstructor<C> = new (o: AwsClientOptions) => C
export type AwsCommandConstructor<CommandInput extends object, Command extends AwsCommand<CommandInput, object>> = new (
    o: CommandInput
) => Command

// AWS-SDKv3 does not export generic types for clients so we need to build them as needed
// https://github.com/aws/aws-sdk-js-v3/issues/5856#issuecomment-2096950979
export interface AwsClient {
    middlewareStack: {
        add: MiddlewareStack<any, MetadataBearer>['add']
    }
    send: (command: AwsCommand<object, object>, options?: any) => Promise<any>
    destroy: () => void
}

export interface AwsCommand<InputType extends object, OutputType extends object> {
    input: InputType
    middlewareStack: any
    resolveMiddleware: (stack: any, configuration: any, options: any) => Handler<any, any>
}

export interface AwsClientOptions {
    credentials: AwsCredentialIdentityProvider
    region: string | Provider<string>
    userAgent: UserAgent
    requestHandler: {
        metadata?: RequestHandlerMetadata
        handle: (req: any, options?: any) => Promise<RequestHandlerOutput<any>>
        destroy?: () => void
    }
    apiVersion: string
    endpoint: string
    retryStrategy: RetryStrategy | RetryStrategyV2
    logger: Logger
    token: TokenIdentity | TokenIdentityProvider
}

interface AwsServiceOptions<C extends AwsClient> {
    serviceClient: AwsClientConstructor<C>
    clientOptions?: Partial<AwsClientOptions>
    region?: string
    userAgent?: boolean
    keepAlive?: boolean
    settings?: DevSettings
}

export class AWSClientBuilderV3 {
    private serviceCache: Map<string, AwsClient> = new Map()
    public constructor(private readonly context: AwsContext) {}

    private getShim(): CredentialsShim {
        const shim = this.context.credentialsShim
        if (!shim) {
            throw new Error('Toolkit is not logged-in.')
        }
        return shim
    }

    private buildHttpHandler() {
        const requestTimeout = 30000
        // HACK: avoid importing node-http-handler on web.
        return isWeb()
            ? new FetchHttpHandler({ keepAlive: true, requestTimeout })
            : new (require('@smithy/node-http-handler').NodeHttpHandler)({
                  httpAgent: { keepAlive: true },
                  httpsAgent: { keepAlive: true },
                  requestTimeout,
              })
    }

    private getHttpHandler = once(this.buildHttpHandler.bind(this))

    private keyAwsService<C extends AwsClient>(serviceOptions: AwsServiceOptions<C>): string {
        // Serializing certain objects in the args allows us to detect when nested objects change (ex. new retry strategy, endpoints)
        return [
            String(serviceOptions.serviceClient),
            JSON.stringify(serviceOptions.clientOptions),
            serviceOptions.region,
            serviceOptions.userAgent ? '1' : '0',
            serviceOptions.settings ? JSON.stringify(serviceOptions.settings.get('endpoints', {})) : '',
        ].join(':')
    }

    public getAwsService<C extends AwsClient>(serviceOptions: AwsServiceOptions<C>): C {
        const key = this.keyAwsService(serviceOptions)
        const cached = this.serviceCache.get(key)
        if (cached) {
            return cached as C
        }

        const service = this.createAwsService(serviceOptions)
        this.serviceCache.set(key, service)
        return service as C
    }

    public createAwsService<C extends AwsClient>(serviceOptions: AwsServiceOptions<C>): C {
        const opt = (serviceOptions.clientOptions ?? {}) as AwsClientOptions
        const userAgent = serviceOptions.userAgent ?? true
        const keepAlive = serviceOptions.keepAlive ?? true

        if (!opt.region && serviceOptions.region) {
            opt.region = serviceOptions.region
        }

        if (!opt.userAgent && userAgent) {
            opt.userAgent = [[getUserAgent({ includePlatform: true, includeClientId: true }), extensionVersion]]
        }

        if (!opt.retryStrategy) {
            // Simple exponential backoff strategy as default.
            opt.retryStrategy = new ConfiguredRetryStrategy(5, (attempt: number) => 1000 * 2 ** attempt)
        }

        if (!opt.requestHandler) {
            opt.requestHandler = this.getHttpHandler()
        }

        if (!opt.credentials && !opt.token) {
            const shim = this.getShim()
            opt.credentials = async () => {
                const creds = await shim.get()
                if (creds.expiration && creds.expiration.getTime() < Date.now()) {
                    return shim.refresh()
                }
                return creds
            }
        }

        const service = new serviceOptions.serviceClient(opt)
        service.middlewareStack.add(telemetryMiddleware, { step: 'deserialize' })
        service.middlewareStack.add(loggingMiddleware, { step: 'finalizeRequest' })
        service.middlewareStack.add(getEndpointMiddleware(serviceOptions.settings), { step: 'build' })

        if (keepAlive) {
            service.middlewareStack.add(keepAliveMiddleware, { step: 'build' })
        }
        return service
    }

    public clearServiceCache() {
        for (const client of this.serviceCache.values()) {
            client.destroy()
        }
        this.serviceCache.clear()
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

const keepAliveMiddleware: BuildMiddleware<any, any> = (next: BuildHandler<any, any>) => async (args: any) =>
    addKeepAliveHeader(next, args)

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
            const output = partialClone(result.output, 3)
            getLogger().debug(`API Response %s: %O`, logTail, output)
        }
        return result
    } catch (e: any) {
        logAndThrow(e, serviceId, logTail)
    }
}

export async function logOnRequest(next: FinalizeHandler<any, any>, args: any) {
    const request = args.request
    if (HttpRequest.isInstance(args.request)) {
        const { hostname, path } = request
        // TODO: omit credentials / sensitive info from the logs.
        const input = partialClone(args.input, 3)
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
    const request = args.request
    if (HttpRequest.isInstance(request)) {
        const serviceId = getServiceId(context)
        const endpoint = serviceId ? settings.get('endpoints', {})[serviceId] : undefined
        if (endpoint) {
            const url = new URL(endpoint)
            Object.assign(request, selectFrom(url, 'hostname', 'port', 'protocol', 'pathname'))
            request.path = (request as typeof request & { pathname: string }).pathname
        }
    }
    return next(args)
}

/**
 * Overwrite agents behavior and add the keepAliveHeader. This is needed due to
 * https://github.com/microsoft/vscode/issues/173861.
 * @param next
 * @param args
 * @returns
 */
export function addKeepAliveHeader(next: BuildHandler<any, any>, args: any) {
    const request = args.request
    if (HttpRequest.isInstance(request)) {
        request.headers['Connection'] = 'keep-alive'
    }
    return next(args)
}
