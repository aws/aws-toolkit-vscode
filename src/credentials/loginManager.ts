/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AwsContext } from '../shared/awsContext'
import { getAccountId } from '../shared/credentials/accountId'
import { getLogger } from '../shared/logger'
import { recordAwsSetCredentials, Result } from '../shared/telemetry/telemetry'
import { CredentialsStore } from './credentialsStore'
import { notifyUserInvalidCredentials } from './credentialsUtilities'
import { asString, CredentialsProviderId } from './providers/credentialsProviderId'
import { CredentialsProviderManager } from './providers/credentialsProviderManager'

export class LoginManager {
    private readonly defaultCredentialsRegion = 'us-east-1'

    public constructor(
        private readonly awsContext: AwsContext,
        private readonly store: CredentialsStore,
        public readonly recordAwsSetCredentialsFn: typeof recordAwsSetCredentials = recordAwsSetCredentials
    ) {}

    /**
     * Establishes a Credentials for the Toolkit to use. Essentially the Toolkit becomes "logged in".
     * If an error occurs while trying to set up and verify these credentials, the Toolkit is "logged out".
     *
     * @param passive  If true, this was _not_ a user-initiated action.
     * @param provider  Credentials provider id
     */
    public async login(args: { passive: boolean; providerId: CredentialsProviderId }): Promise<void> {
        let loginResult: Result = 'Succeeded'
        try {
            const provider = await CredentialsProviderManager.getInstance().getCredentialsProvider(args.providerId)
            if (!provider) {
                throw new Error(`Could not find Credentials Provider for ${asString(args.providerId)}`)
            }

            const storedCredentials = await this.store.upsertCredentials(args.providerId, provider)
            if (!storedCredentials) {
                throw new Error(`No credentials found for id ${asString(args.providerId)}`)
            }

            const credentialsRegion = provider.getDefaultRegion() ?? this.defaultCredentialsRegion
            const accountId = await getAccountId(storedCredentials.credentials, credentialsRegion)
            if (!accountId) {
                throw new Error('Could not determine Account Id for credentials')
            }

            await this.awsContext.setCredentials({
                credentials: storedCredentials.credentials,
                credentialsId: asString(args.providerId),
                accountId: accountId,
                defaultRegion: provider.getDefaultRegion(),
            })
        } catch (err) {
            loginResult = 'Failed'
            getLogger().error(
                `Error trying to connect to AWS with Credentials Provider ${asString(
                    args.providerId
                )}. Toolkit will now disconnect from AWS. %O`,
                err as Error
            )
            this.store.invalidateCredentials(args.providerId)

            await this.logout()

            notifyUserInvalidCredentials(args.providerId)
        } finally {
            if (!args.passive) {
                this.recordAwsSetCredentialsFn({ result: loginResult })
            }
        }
    }

    /**
     * Removes Credentials from the Toolkit. Essentially the Toolkit becomes "logged out".
     */
    public async logout(): Promise<void> {
        await this.awsContext.setCredentials(undefined)
    }
}
