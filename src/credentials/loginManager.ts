/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { AwsContext } from '../shared/awsContext'
import { credentialHelpUrl } from '../shared/constants'
import { getAccountId } from '../shared/credentials/accountId'
import { getLogger } from '../shared/logger'
import { recordAwsSetCredentials, Result } from '../shared/telemetry/telemetry'
import { CredentialsStore } from './credentialsStore'
import { CredentialsProvider } from './providers/credentialsProvider'
import { asString, CredentialsProviderId } from './providers/credentialsProviderId'
import { CredentialsProviderManager } from './providers/credentialsProviderManager'

export class LoginManager {
    private readonly defaultCredentialsRegion = 'us-east-1'
    private readonly credentialsStore: CredentialsStore = new CredentialsStore()

    public constructor(
        private readonly awsContext: AwsContext,
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

            await this.updateCredentialsStore(args.providerId, provider)

            const storedCredentials = await this.credentialsStore.getCredentials(args.providerId)
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
            this.credentialsStore.invalidateCredentials(args.providerId)

            await this.logout()

            this.notifyUserInvalidCredentials(args.providerId)
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

    /**
     * Updates the CredentialsStore if the credentials are considered different
     */
    private async updateCredentialsStore(
        credentialsProviderId: CredentialsProviderId,
        provider: CredentialsProvider
    ): Promise<void> {
        const storedCredentials = await this.credentialsStore.getCredentials(credentialsProviderId)
        if (provider.getHashCode() !== storedCredentials?.credentialsHashCode) {
            getLogger().verbose(
                `Credentials for ${asString(credentialsProviderId)} have changed, using updated credentials.`
            )
            this.credentialsStore.invalidateCredentials(credentialsProviderId)
        }

        await this.credentialsStore.getOrCreateCredentials(credentialsProviderId, provider)
    }

    private notifyUserInvalidCredentials(credentialProviderId: CredentialsProviderId) {
        const getHelp = localize('AWS.message.credentials.invalid.help', 'Get Help...')
        const viewLogs = localize('AWS.message.credentials.invalid.logs', 'View Logs...')

        vscode.window
            .showErrorMessage(
                localize(
                    'AWS.message.credentials.invalid',
                    'Invalid Credentials {0}, see logs for more information.',
                    asString(credentialProviderId)
                ),
                getHelp,
                viewLogs
            )
            .then((selection: string | undefined) => {
                if (selection === getHelp) {
                    vscode.env.openExternal(vscode.Uri.parse(credentialHelpUrl))
                } else if (selection === viewLogs) {
                    vscode.commands.executeCommand('aws.viewLogs')
                }
            })
    }
}
