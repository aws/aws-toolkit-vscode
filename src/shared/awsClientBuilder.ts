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

        // Record request IDs to the current context, potentially overriding the field if
        // multiple API calls are made in the same context. We only do failures as successes
        // are generally uninteresting and noisy.
        listeners.push(request => {
            request.on('error', err => {
                if (!err.retryable) {
                    // TODO: update codegen so `record` enumerates all fields as a flat object instead of
                    // intersecting all of the definitions
                    interface RequestData {
                        requestId?: string
                        requestServiceType?: string
                    }

                    telemetry.record({
                        requestId: err.requestId,
                        requestServiceType: serviceName,
                    } satisfies RequestData as any)
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
