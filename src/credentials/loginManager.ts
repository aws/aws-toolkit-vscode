/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AwsContext, AwsContextCredentials } from '../shared/awsContext'
import { getLogger } from '../shared/logger'
import { recordAwsSetCredentials, Result } from '../shared/telemetry/telemetry'
import { asString, CredentialsProviderId } from './providers/credentialsProviderId'
import { notifyUserInvalidCredentials } from './credentialsUtilities'
import { CredentialsProviderManager } from './providers/credentialsProviderManager'
import { CredentialsStore } from './credentialsStore'
import { getAccountId } from '../shared/credentials/accountId'

export class LoginManager {
    private readonly defaultCredentialsRegion = 'us-east-1'

    public constructor(private readonly awsContext: AwsContext, private readonly store: CredentialsStore) {}

    /**
     * Establishes a Credentials for the Toolkit to use. Essentially the Toolkit becomes "logged in".
     * If an error occurs while trying to set up and verify these credentials, the Toolkit is "logged out".
     */
    public async login(credentialsProviderId: CredentialsProviderId): Promise<void> {
        let loginResult: Result = 'Succeeded'
        try {
            await this.awsContext.setCredentials(await this.getAwsContextCredentials(credentialsProviderId))
        } catch (err) {
            loginResult = 'Failed'
            getLogger().error(
                `Error trying to connect to AWS with Credentials Provider ${asString(
                    credentialsProviderId
                )}. Toolkit will now disconnect from AWS. %O`,
                err as Error
            )

            await this.logout()

            notifyUserInvalidCredentials(credentialsProviderId)
        } finally {
            recordAwsSetCredentials({ result: loginResult })
        }
    }

    /**
     * Removes Credentials from the Toolkit. Essentially the Toolkit becomes "logged out".
     */
    public async logout(): Promise<void> {
        await this.awsContext.setCredentials(undefined)
    }

    private async getAwsContextCredentials(
        credentialsProviderId: CredentialsProviderId
    ): Promise<AwsContextCredentials> {
        const provider = await CredentialsProviderManager.getInstance().getCredentialsProvider(credentialsProviderId)
        if (!provider) {
            this.store.invalidateCredentials(credentialsProviderId)
            throw new Error(`Could not find Credentials Provider for ${asString(credentialsProviderId)}`)
        }

        const storedCredentials = await this.store.upsertCredentials(credentialsProviderId, provider)

        if (!storedCredentials) {
            this.store.invalidateCredentials(credentialsProviderId)
            throw new Error(`No credentials found for id ${asString(credentialsProviderId)}`)
        }

        const credentialsRegion = provider.getDefaultRegion() ?? this.defaultCredentialsRegion
        const accountId = await getAccountId(storedCredentials.credentials, credentialsRegion)
        if (!accountId) {
            this.store.invalidateCredentials(credentialsProviderId)
            throw new Error('Could not determine Account Id for credentials')
        }

        return {
            credentials: storedCredentials.credentials,
            credentialsId: asString(credentialsProviderId),
            accountId: accountId,
            defaultRegion: provider.getDefaultRegion(),
        }
    }
}
