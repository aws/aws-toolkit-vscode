/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, AWSError, Credentials } from 'aws-sdk'
import { CredentialsOptions } from 'aws-sdk/lib/credentials'
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import { AwsContext } from './awsContext'
import { DevSettings } from './settings'
import { getUserAgent } from './telemetry/util'
import { telemetry } from './telemetry/telemetry'
import { Client, SmithyConfiguration, SmithyResolvedConfiguration } from '@aws-sdk/smithy-client'
import {
    EndpointsInputConfig,
    EndpointsResolvedConfig,
    RegionInputConfig,
    RegionResolvedConfig,
} from '@aws-sdk/config-resolver'
import { HostHeaderInputConfig, HostHeaderResolvedConfig } from '@aws-sdk/middleware-host-header'
import { RetryInputConfig, RetryResolvedConfig } from '@aws-sdk/middleware-retry'
import { AwsAuthInputConfig, AwsAuthResolvedConfig } from '@aws-sdk/middleware-signing'
import { TokenInputConfig, TokenResolvedConfig } from '@aws-sdk/middleware-token'
import { UserAgentInputConfig, UserAgentResolvedConfig } from '@aws-sdk/middleware-user-agent'
import { HttpHandlerOptions, MiddlewareStack } from '@aws-sdk/types'
import { HttpRequest, HttpResponse } from '@aws-sdk/protocol-http'
import globals from './extensionGlobals'
import { getLogger } from './logger'
import { selectFrom } from './utilities/tsUtils'
import { getRequestId } from './errors'

// These are not on the public API but are very useful for logging purposes.
// Tests guard against the possibility that these values change unexpectedly.
// Since the field names are not prepended with `_` to signify visibility, the
// fact that they're not in the API may have been an oversight.
interface RequestExtras {
    readonly service: AWS.Service
    readonly operation: string
    readonly params?: any
}

type RequestListener = (request: AWS.Request<any, AWSError> & RequestExtras) => void
export type ServiceOptions = ServiceConfigurationOptions & {
    /**
     * The frequency and (lack of) idempotency of events is highly dependent on the SDK implementation
     * For example, 'error' may fire more than once for a single request
     *
     * Example usage:
     *
     * ```ts
     * const service = await builder.createAwsService(FakeService, {
     *     onRequestSetup: [
     *         req => {
     *             console.log('req: %O [%O]', req.operation, req.params)
     *             req.on('error', e => (errorCount += !e.originalError ? 1 : 0))
     *         },
     *     ],
     * })
     * ```
     */
    onRequestSetup?: RequestListener | RequestListener[]
}

export interface AWSClientBuilder {
    /**
     * Creates AWS service object of the given type, and sets options defaults.
     *
     * @param type  AWS service type
     * @param options  AWS service configuration options
     * @param region  AWS region override
     * @param userAgent  Set the Toolkit user agent
     * @returns
     */
    createAwsService<T extends AWS.Service>(
        type: new (o: ServiceConfigurationOptions) => T,
        options?: ServiceOptions,
        region?: string,
        userAgent?: boolean,
        settings?: DevSettings
    ): Promise<T>
}

export class DefaultAWSClientBuilder implements AWSClientBuilder {
    public constructor(private readonly awsContext: AwsContext) {}

    public async createAwsService<T extends AWS.Service>(
        type: new (o: ServiceConfigurationOptions) => T,
        options?: ServiceOptions,
        region?: string,
        userAgent: boolean = true,
        settings = DevSettings.instance
    ): Promise<T> {
        const onRequest = options?.onRequestSetup ?? []
        const listeners = Array.isArray(onRequest) ? onRequest : [onRequest]
        const opt = { ...options }
        delete opt.onRequestSetup

        if (!opt.credentials && !opt.token) {
            const shim = this.awsContext.credentialsShim

            if (!shim) {
                throw new Error('Toolkit is not logged-in.')
            }

            opt.credentials = new (class extends Credentials {
                public constructor() {
                    // The class doesn't like being instantiated with empty creds
                    super({ accessKeyId: '???', secretAccessKey: '???' })
                }

                public override get(callback: (err?: AWSError) => void): void {
                    // Always try to fetch the latest creds first, attempting a refresh if needed
                    // A 'passive' refresh is attempted first, before trying an 'active' one if certain criteria are met
                    shim.get()
                        .then(creds => {
                            this.loadCreds(creds)
                            this.needsRefresh() ? this.refresh(callback) : callback()
                        })
                        .catch(callback)
                }

                public override refresh(callback: (err?: AWSError) => void): void {
                    shim.refresh()
                        .then(creds => {
                            this.loadCreds(creds)
                            // The SDK V2 sets `expired` on certain errors so we should only
                            // unset the flag after acquiring new credentials via `refresh`
                            this.expired = false
                            callback()
                        })
                        .catch(callback)
                }

                private loadCreds(creds: CredentialsOptions & { expiration?: Date }) {
                    this.accessKeyId = creds.accessKeyId
                    this.secretAccessKey = creds.secretAccessKey
                    this.sessionToken = creds.sessionToken ?? this.sessionToken
                    this.expireTime = creds.expiration ?? this.expireTime
                }
            })()
        }

        if (!opt.region && region) {
            opt.region = region
        }

        if (userAgent && !opt.customUserAgent) {
            opt.customUserAgent = await getUserAgent({ includePlatform: true, includeClientId: true })
        }

        const apiConfig = (opt as { apiConfig?: { metadata?: Record<string, string> } } | undefined)?.apiConfig
        const serviceName =
            apiConfig?.metadata?.serviceId?.toLowerCase() ??
            (type as unknown as { serviceIdentifier?: string }).serviceIdentifier

        if (serviceName) {
            opt.endpoint = settings.get('endpoints', {})[serviceName] ?? opt.endpoint
        }

        const service = new type(opt)
        const originalSetup = service.setupRequestListeners.bind(service)

        listeners.push(request => {
            request.on('error', err => {
                if (!err.retryable) {
                    recordErrorTelemetry(err, serviceName)
                }
            })
        })

        service.setupRequestListeners = (request: Request<any, AWSError>) => {
            originalSetup(request)
            listeners.forEach(l => l(request as AWS.Request<any, AWSError> & RequestExtras))
        }

        return service
    }
}

type InputConfig = Partial<
    SmithyConfiguration<HttpHandlerOptions> &
        RegionInputConfig &
        EndpointsInputConfig &
        RetryInputConfig &
        HostHeaderInputConfig &
        (AwsAuthInputConfig | TokenInputConfig) &
        (UserAgentInputConfig | { customUserAgent?: boolean })
>
type ResolvedConfig = SmithyResolvedConfiguration<HttpHandlerOptions> &
    RegionResolvedConfig &
    EndpointsResolvedConfig &
    RetryResolvedConfig &
    HostHeaderResolvedConfig &
    (AwsAuthResolvedConfig | TokenResolvedConfig) &
    UserAgentResolvedConfig

function isSigv4Config<T extends object>(config: T): config is T & AwsAuthInputConfig {
    return 'credentials' in config || !('token' in config)
}

function isBearerTokenConfig<T extends object>(config: T): config is T & TokenInputConfig {
    return 'token' in config || !('credentials' in config)
}

type ClientMiddleware<T> = T extends Client<any, infer I, infer O, any>
    ? ExtractOverload5<MiddlewareStack<I, O>['add']>[2][]
    : never

type ExtractOverload5<T> = T extends {
    (...args: infer P1): infer R1
    (...args: infer P2): infer R2
    (...args: infer P3): infer R3
    (...args: infer P4): infer R4
    (...args: infer P5): infer R5
}
    ? [P1, P2, P3, P4, P5]
    : never

type ClientOptions<T, U> = Omit<U, 'customUserAgent'> & {
    customUserAgent?: boolean | string | [string, string][]
    middleware?: ClientMiddleware<T>
}

export function createAwsService2<
    T extends Client<HttpHandlerOptions, any, any, ResolvedConfig>,
    U extends InputConfig
>(ctor: new (config: U) => T, config: ClientOptions<T, U>): T {
    if (isBearerTokenConfig(config) && config.token === undefined) {
        // TODO: inject bearer token
    }

    if (isSigv4Config(config) && config.credentials === undefined) {
        const shim = globals.awsContext.credentialsShim
        if (!shim) {
            throw new Error('Toolkit is not logged-in.')
        }

        config.credentials = async () => {
            const creds = await shim.get()
            if (creds.expiration && creds.expiration.getTime() < Date.now()) {
                return shim.refresh()
            }

            return creds
        }
    }

    const customUserAgent = config.customUserAgent ?? true
    if (typeof config.customUserAgent === 'boolean') {
        delete config.customUserAgent
    }

    const middleware = config.middleware ?? []
    delete config.middleware

    const client = new ctor(config as U)
    addLoggingMiddleware(client)

    if (config.endpoint === undefined) {
        addEndpointMiddleware(client)
    }

    if (customUserAgent === true) {
        addUseragentMiddleware(client)
    }

    middleware.forEach(args => client.middlewareStack.add(...args))

    return client
}

function omitIfPresent<T extends Record<string, unknown>>(obj: T, ...keys: string[]): T {
    const objCopy = { ...obj }
    for (const key of keys) {
        if (key in objCopy) {
            ;(objCopy as any)[key] = '[omitted]'
        }
    }
    return objCopy
}

// Record request IDs to the current context, potentially overriding the field if
// multiple API calls are made in the same context. We only do failures as successes
// are generally uninteresting and noisy.
function recordErrorTelemetry(err: Error, serviceName?: string) {
    // TODO: update codegen so `record` enumerates all fields as a flat object instead of
    // intersecting all of the definitions
    interface RequestData {
        requestId?: string
        requestServiceType?: string
    }

    telemetry.record({
        requestId: getRequestId(err),
        requestServiceType: serviceName,
    } satisfies RequestData as any)
}

function getServiceId(context: { clientName?: string; commandName?: string }) {
    return context.clientName?.toLowerCase().replace(/client$/, '')
}
interface LoggingOptions {
    readonly sensitiveFields?: string[]
    readonly ignoredErrors?: (string | typeof Error)[]
}

function addLoggingMiddleware(client: Client<HttpHandlerOptions, any, any, any>, opt: LoggingOptions = {}) {
    function isExcludedError(e: Error) {
        return (
            opt.ignoredErrors?.find(x => e.name === x) ||
            ('code' in e && opt.ignoredErrors?.find(x => e.code === x)) ||
            opt.ignoredErrors?.find(x => typeof x !== 'string' && e instanceof x)
        )
    }

    client.middlewareStack.add(
        (next, context) => args => {
            if (HttpRequest.isInstance(args.request)) {
                const { hostname, path } = args.request
                const input = omitIfPresent(args.input, ...(opt.sensitiveFields ?? []))
                getLogger().debug('API request (%s %s): %O', hostname, path, input)
            }
            return next(args)
        },
        { step: 'finalizeRequest' }
    )

    client.middlewareStack.add(
        (next, context) => async args => {
            if (!HttpRequest.isInstance(args.request)) {
                return next(args)
            }

            const { hostname, path } = args.request
            const result = await next(args).catch(e => {
                if (e instanceof Error && !isExcludedError(e)) {
                    recordErrorTelemetry(e, getServiceId(context as object))

                    const err = { ...e }
                    delete err['stack']
                    getLogger().error('API response (%s %s): %O', hostname, path, err)
                }
                throw e
            })
            if (HttpResponse.isInstance(result.response)) {
                const output = omitIfPresent(result.output, ...(opt.sensitiveFields ?? []))
                getLogger().debug('API response (%s %s): %O', hostname, path, output)
            }

            return result
        },
        { step: 'deserialize' }
    )

    return client
}

function addUseragentMiddleware(client: Client<HttpHandlerOptions, any, any, any>) {
    client.middlewareStack.add(
        (next, context) => async args => {
            // The normal JS SDK behavior _appends_ the user-provided UA
            // This is non-standard, but we will conform regardless.
            context.userAgent = [
                ...(context.userAgent ?? []),
                ...(await getUserAgent({ includePlatform: true, includeClientId: true }))
                    .split(' ')
                    .map(p => p.split('/') as [string, string]),
            ]

            return next(args)
        },
        { step: 'build' }
    )
}

function addEndpointMiddleware(client: Client<HttpHandlerOptions, any, any, any>, settings = DevSettings.instance) {
    client.middlewareStack.add(
        (next, context) => async args => {
            console.log(context)

            if (HttpRequest.isInstance(args.request)) {
                // This is brittle
                const serviceId = getServiceId(context as object)
                const endpoint = serviceId ? settings.get('endpoints', {})[serviceId] : undefined

                if (endpoint) {
                    const url = new URL(endpoint)
                    Object.assign(args.request, selectFrom(url, 'hostname', 'port', 'protocol'))
                }
            }

            return next(args)
        },
        { step: 'build' }
    )
}
