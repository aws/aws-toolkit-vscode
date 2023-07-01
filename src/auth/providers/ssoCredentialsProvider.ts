/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Credentials } from '@aws-sdk/types'
import { CredentialType } from '../../shared/telemetry/telemetry.gen'
import { getStringHash } from '../../shared/utilities/textUtilities'
import { CredentialsId, CredentialsProvider, CredentialsProviderType } from './credentials'
import { SsoClient } from '../sso/clients'
import { SsoAccessTokenProvider } from '../sso/ssoAccessTokenProvider'

export class SsoCredentialsProvider implements CredentialsProvider {
    public constructor(
        private readonly id: CredentialsId,
        private readonly client: SsoClient,
        private readonly tokenProvider: SsoAccessTokenProvider,
        private readonly accountId: string,
        private readonly roleName: string
    ) {}

    public async isAvailable(): Promise<boolean> {
        return true
    }

    public getCredentialsId(): CredentialsId {
        return this.id
    }

    public getProviderType(): CredentialsProviderType {
        return this.id.credentialSource
    }

    public getTelemetryType(): CredentialType {
        return 'ssoProfile'
    }

    public getDefaultRegion(): string | undefined {
        return this.client.region
    }

    public getHashCode(): string {
        return getStringHash(this.accountId + this.roleName)
    }

    public async canAutoConnect(): Promise<boolean> {
        return this.hasToken()
    }

    public async getCredentials(): Promise<Credentials> {
        if (!(await this.hasToken())) {
            await this.tokenProvider.createToken()
        }

        return this.client.getRoleCredentials({
            accountId: this.accountId,
            roleName: this.roleName,
        })
    }

    private async hasToken() {
        return (await this.tokenProvider.getToken()) !== undefined
    }
}
