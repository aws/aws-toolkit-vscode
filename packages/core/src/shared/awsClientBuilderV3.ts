/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CredentialsShim } from '../auth/deprecated/loginManager'
import { AwsContext } from './awsContext'
import { AwsCredentialIdentityProvider, Client } from '@smithy/types'
import { getUserAgent } from './telemetry/util'
import { DevSettings } from './settings'
import { Provider, UserAgent } from '@aws-sdk/types'

export type AwsClient = Client<any, any, any>
export interface AwsClientOptions {
    credentials?: AwsCredentialIdentityProvider
    region?: string | Provider<string>
    customUserAgent?: UserAgent
}

export interface AWSClientBuilderV3 {
    createAwsService<T extends AwsClient>(
        type: new (o: AwsClientOptions) => T,
        options?: AwsClientOptions,
        region?: string,
        userAgent?: string,
        settings?: DevSettings
    ): Promise<T>
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

    public async createAwsService<T extends AwsClient>(
        type: new (o: Partial<AwsClientOptions>) => T,
        options?: AwsClientOptions,
        region?: string,
        userAgent?: string,
        settings?: DevSettings
    ): Promise<T> {
        const opt = { ...options }
        const shim = this.getShim()

        if (!opt.region && region) {
            opt.region = region
        }

        if (!opt.customUserAgent && userAgent) {
            opt.customUserAgent = [[getUserAgent({ includePlatform: true, includeClientId: true })]]
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
