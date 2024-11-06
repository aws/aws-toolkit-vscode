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
import { Provider, UserAgent } from '@aws-sdk/types'
import { Client } from '@aws-sdk/smithy-client'

export type AwsClient = IClient<any, any, any> | Client<any, any, any, any>
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
        return service
    }
}
