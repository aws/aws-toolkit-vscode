/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from './extensionGlobals'

import { Request, AWSError } from 'aws-sdk'
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import { env, version } from 'vscode'
import { Auth, Connection, isIamConnection, isSsoConnection } from '../credentials/auth'
import { SdkCredentialsProvider, SdkTokenProvider } from '../credentials/sdkV2Compat'
import { ToolkitError } from './errors'
import { DevSettings } from './settings'
import { getClientId } from './telemetry/util'
import { Mutable } from './utilities/tsUtils'
import { extensionVersion } from './vscode/env'

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
export type ClientConfiguration = ServiceConfigurationOptions & {
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
    readonly onRequestSetup?: RequestListener | RequestListener[]

    /**
     * Connection to use for sending requests.
     *
     * Credentials provided by {@link ServiceConfigurationOptions.credentials} or {@link ServiceConfigurationOptions.token} have precedence.
     */
    readonly connection?: Connection

    /**
     * Enablement flag for sending the Toolkit user-agent (default: true)
     */
    readonly shouldSendUserAgent?: boolean

    /**
     * Hidden SDK field used to set an API model explicitly.
     */
    readonly apiConfig?: any
}

export class AWSClientBuilder {
    public constructor(private readonly auth: Auth) {}

    /**
     * Creates AWS service object of the given type, and sets options defaults.
     */
    public async createAwsService<T extends AWS.Service>(
        type: new (o: ServiceConfigurationOptions) => T,
        config?: ClientConfiguration,
        settings = DevSettings.instance
    ): Promise<T> {
        const onRequest = config?.onRequestSetup ?? []
        const listeners = Array.isArray(onRequest) ? onRequest : [onRequest]
        const opt: Mutable<ClientConfiguration> = { shouldSendUserAgent: true, ...config }
        opt.connection ??= this.auth.activeConnection
        delete opt.onRequestSetup

        if (opt.connection && !(opt.token || opt.credentials)) {
            if (isSsoConnection(opt.connection)) {
                opt.token = new SdkTokenProvider(opt.connection)
            } else if (isIamConnection(opt.connection)) {
                opt.credentials = new SdkCredentialsProvider(opt.connection)
            }

            opt.region ??= opt.connection.defaultRegion
        }

        if (!opt.connection && !opt.credentials && !opt.token) {
            throw new ToolkitError('Toolkit is not logged-in.', { code: 'NoConnection' })
        }

        if (opt.shouldSendUserAgent && !opt.customUserAgent) {
            const platformName = env.appName.replace(/\s/g, '-')
            const clientId = await getClientId(globals.context.globalState)
            opt.customUserAgent = `AWS-Toolkit-For-VSCode/${extensionVersion} ${platformName}/${version} ClientId/${clientId}`
        }

        const apiConfig = (opt as { apiConfig?: { metadata?: Record<string, string> } } | undefined)?.apiConfig
        const serviceName =
            apiConfig?.metadata?.serviceId ?? (type as unknown as { serviceIdentifier?: string }).serviceIdentifier
        if (serviceName) {
            opt.endpoint = settings.get('endpoints', {})[serviceName.toLowerCase()] ?? opt.endpoint
        }

        const service = new type(opt)
        const originalSetup = service.setupRequestListeners.bind(service)

        service.setupRequestListeners = (request: Request<any, AWSError>) => {
            originalSetup(request)
            listeners.forEach(l => l(request as AWS.Request<any, AWSError> & RequestExtras))
        }

        return service
    }
}
