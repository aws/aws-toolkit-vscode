/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from './extensionGlobals'

import { Request, Service, AWSError, Credentials as CredentialsClass } from 'aws-sdk'
import { CredentialsOptions } from 'aws-sdk/lib/credentials'
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import { CredentialsShim } from '../credentials/loginManager'
import { FunctionKeys, getFunctions } from './utilities/classUtils'
import { SharedKeys } from './utilities/tsUtils'
import { getClientId } from './telemetry/util'
import { env, version } from 'vscode'
import { extensionVersion, isReleaseVersion } from './vscode/env'
import { AsyncCollection, toCollection } from './utilities/asyncCollection'
import { getLogger } from './logger/logger'
import { ToolkitError } from './errors'

interface PromiseResult<T, E = unknown> extends Promise<T> {
    catch<R, U>(onrejected?: (reason: E) => R | PromiseResult<R, U>): PromiseResult<T | R, U>
    catch<R = never>(onrejected?: (reason: E) => R | PromiseLike<R>): PromiseResult<T | R>
}

type ShiftTuple<T> = T extends [infer _, ...infer U] ? U : never

interface Operation<T extends any[], R, E = unknown> {
    (...args: T): ServiceRequest<R, E>
    send(...args: T): ServiceRequest<R, E>
    paginate(mark: SharedKeys<T[0], R>, request: T[0], ...rest: ShiftTuple<T>): AsyncCollection<R>
}

interface ServiceRequest<T, E = unknown> extends PromiseResult<T, E> {
    readonly operation: string
    readonly headers: Record<string, string | undefined>
    cancel(reason?: string): void

    // should only be used for instrumentation
    onResponse(listener: ResponseListener): this
}

interface ServiceResponse {
    readonly requestId: string
    readonly headers: Record<string, string | undefined>
}

type RequestListener = (request: ServiceRequest<unknown>) => void
type ResponseListener = (response: ServiceResponse) => void

interface Configuration {
    readonly region?: string
    readonly endpoint?: string
    readonly sendUserAgent?: boolean
    readonly credentials?: CredentialsOptions | (() => Promise<CredentialsOptions>)
    readonly requestListeners?: RequestListener[]
    readonly retryableErrorMatchers?: ((error: AWSError) => boolean)[]
}

type RemoveOverload<T> = T extends {
    (...args: infer A1): infer R1
    (...args: infer _A2): infer _R2
}
    ? { (...args: A1): R1 }
    : T

type RemoveCallback<T> = T extends (...args: [...params: infer U, callback?: (...args: any[]) => any]) => infer R
    ? (...args: U) => R
    : T
type MapRequest<T> = T extends (...args: infer U) => Request<infer R, infer E> ? Operation<U, R, E> : T
type MapSdkV2<T extends Service> = Pick<
    { [P in keyof T]: MapRequest<RemoveCallback<RemoveOverload<T[P]>>> },
    FunctionKeys<T>
>

interface ClientDefinition extends Configuration {
    readonly apiConfig?: any
    readonly logging?: boolean
}

interface SdkV2Service {
    readonly [key: string]: (...args: any[]) => Request<unknown, unknown> | unknown
}

class SdkV2Wrapper {
    private readonly serviceName: string

    public constructor(private readonly service: Service, private readonly config: ClientDefinition = {}) {
        const proto = Object.getPrototypeOf(this.service)
        this.serviceName = proto.serviceIdentifier ?? proto.api?.serviceId ?? '[unknown service]'

        // Prototype binding would be better but that's easily doable with bound functions
        for (const [k, v] of Object.entries(getFunctions(proto.constructor as new () => SdkV2Service))) {
            const operation = this.sendRequest.bind(this, k, v)

            ;(this as any)[k] = Object.assign(operation, {
                send: operation,
                paginate: paginate.bind(undefined, operation),
            })
        }
    }

    private sendRequest<T extends any[], R, E>(
        operation: string,
        fn: (this: Service, ...args: T) => Request<R, E> | unknown,
        ...args: T
    ): ServiceRequest<R | unknown, E> {
        const headers: Record<string, string | undefined> = {}
        const responseListeners = [] as ResponseListener[]
        let sdkRequest: Request<R, E>
        let cancelReason: string | undefined

        const requestPromise: PromiseResult<R | unknown, E> = new Promise(async resolve => {
            this.service.config.update(await this.resolveOptions())

            const val = fn.call(this.service, ...args)
            if (!(val instanceof Request)) {
                return resolve(val)
            }

            sdkRequest = val

            if (this.config.logging) {
                getLogger().debug(
                    `${this.serviceName} (operation: ${request.operation}): called with %O`,
                    (val as any).params
                )
            }

            // The request can be cancelled before it exists
            if (cancelReason !== undefined) {
                val.abort()
            }

            this.config.requestListeners?.forEach(cb => cb(request))

            val.on('build', req => {
                for (const [k, v] of Object.entries(headers)) {
                    if (v === undefined) {
                        delete req.httpRequest.headers[k]
                    } else {
                        req.httpRequest.headers[k] = v
                    }
                }
            })

            val.on('retry', resp => {
                if (!resp.error) {
                    return
                }

                const canRetry = this.config.retryableErrorMatchers?.some(fn => fn(resp.error))
                if (canRetry) {
                    // add log?
                    globals.awsContext.credentialsShim?.refresh()
                    resp.error.retryable = true
                }
            })

            val.on('complete', resp => {
                const response: ServiceResponse = {
                    requestId: resp.requestId,
                    headers: resp.httpResponse.headers,
                }

                responseListeners.forEach(cb => cb(response))

                if (
                    resp.error !== undefined &&
                    cancelReason !== undefined &&
                    resp.error.name === 'RequestAbortedError'
                ) {
                    resp.error.originalError = new ToolkitError('Request cancelled', {
                        cancelled: cancelReason === 'user',
                        code: cancelReason,
                    })
                }

                if (this.config.logging) {
                    getLogger().debug(
                        `${this.serviceName} (operation: ${request.operation}, requestId: ${resp.requestId}): returned %O`,
                        resp.data ?? resp.error
                    )
                }
            })

            resolve(sdkRequest.promise())
        })

        const request = Object.assign(requestPromise, {
            headers,
            operation,
            cancel: (reason: string) => ((cancelReason ??= reason ?? 'user'), sdkRequest?.abort()),
            onResponse: (listener: ResponseListener) => (responseListeners.push(listener), request),
        })

        return request
    }

    private async resolveOptions() {
        const credentials =
            typeof this.config.credentials === 'function'
                ? await this.config.credentials()
                : this.config.credentials ?? SdkV2Credentials.getToolkitCredentials()

        const customUserAgent = this.config.sendUserAgent ? await getUserAgent() : undefined

        return { credentials, customUserAgent }
    }
}

function paginate<T, R, U extends any[]>(
    operation: Operation<[T, ...U], R>['send'],
    tokenKey: SharedKeys<T, R>,
    request: T,
    ...rest: U
): AsyncCollection<R> {
    request = { ...request }

    return toCollection(async function* () {
        do {
            const response = await operation(request, ...rest)
            if (!response[tokenKey]) {
                return response
            }

            yield response
            request[tokenKey] = response[tokenKey] as T[typeof tokenKey]
        } while (request[tokenKey])
    })
}

export function defineClient<T extends Service>(
    service: new (options?: ServiceConfigurationOptions) => T,
    definition?: ClientDefinition
): new (options?: Configuration & ServiceConfigurationOptions) => MapSdkV2<T> {
    return class extends SdkV2Wrapper {
        public constructor(config?: Configuration & ServiceConfigurationOptions) {
            const mergedConfig = {
                logging: !isReleaseVersion(true),
                ...definition,
                ...config,
                credentials: undefined,
            }

            super(new service(mergedConfig), mergedConfig)
        }
    } as unknown as new (options?: Configuration & ServiceConfigurationOptions) => MapSdkV2<T>
}

class SdkV2Credentials extends CredentialsClass {
    public constructor(private readonly shim: CredentialsShim) {
        // The class doesn't like being instantiated with empty creds
        super({ accessKeyId: '???', secretAccessKey: '???' })
    }

    public override get(callback: (err?: AWSError) => void): void {
        // Always try to fetch the latest creds first, attempting a refresh if needed
        // A 'passive' refresh is attempted first, before trying an 'active' one if certain criteria are met
        this.shim
            .get()
            .then(creds => {
                this.loadCreds(creds)
                this.needsRefresh() ? this.refresh(callback) : callback()
            })
            .catch(callback)
    }

    public override refresh(callback: (err?: AWSError) => void): void {
        this.shim
            .refresh()
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

    public static getToolkitCredentials(shim = globals.awsContext.credentialsShim) {
        return shim ? new this(shim) : undefined
    }
}

async function getUserAgent() {
    const platformName = env.appName.replace(/\s/g, '-')
    const clientId = await getClientId(globals.context.globalState)

    return `AWS-Toolkit-For-VSCode/${extensionVersion} ${platformName}/${version} ClientId/${clientId}`
}
