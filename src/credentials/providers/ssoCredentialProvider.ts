/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Credentials } from '@aws-sdk/types'
import { SsoAccessTokenProvider } from '../sso/ssoAccessTokenProvider'
import { hasStringProps } from '../../shared/utilities/tsUtils'
import { CredentialsId, CredentialsProvider } from './credentials'
import { CredentialType } from '../../shared/telemetry/telemetry.gen'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { SsoWizard } from '../wizards/sso'
import { SsoClient } from '../sso/clients'

export class SsoProvider implements CredentialsProvider {
    public static readonly type = 'sso' as const

    public constructor(private readonly name: string, private readonly profile: Record<string, string | undefined>) {}

    public async getCredentials(): Promise<Credentials> {
        const wizard = new SsoWizard({
            region: this.getDefaultRegion(),
            roleName: this.profile['sso_role_name'],
            accountId: this.profile['sso_account_id'],
            startUrl: this.profile['sso_start_url'],
        })

        const response = await wizard.run()
        if (!response) {
            throw new CancellationError('user')
        }

        const client = SsoClient.create(response.region, response.tokenProvider)

        return client.getRoleCredentials(response)
    }

    public async canAutoConnect(): Promise<boolean> {
        if (!hasStringProps(this.profile, 'sso_start_url', 'sso_region')) {
            return false
        }

        const provider = SsoAccessTokenProvider.create({
            startUrl: this.profile['sso_start_url'],
            region: this.profile['sso_region'],
        })

        return (await provider.getToken()) !== undefined
    }

    public async isAvailable(): Promise<boolean> {
        return true
    }

    public getProviderType() {
        return SsoProvider.type
    }

    public getTelemetryType(): CredentialType {
        return 'ssoProfile'
    }

    public getDefaultRegion(): string | undefined {
        return this.profile['sso_region']
    }

    public getHashCode(): string {
        return JSON.stringify(this.profile)
    }

    public getCredentialsId(): CredentialsId {
        return {
            credentialSource: SsoProvider.type,
            credentialTypeId: this.name,
        }
    }
}
