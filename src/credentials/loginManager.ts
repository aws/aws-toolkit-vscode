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

    public constructor(private readonly awsContext: AwsContext) {}

    /**
     * Establishes a Credentials for the Toolkit to use. Essentially the Toolkit becomes "logged in".
     * If an error occurs while trying to set up and verify these credentials, the Toolkit is "logged out".
     */
    public async login(credentialsProviderId: CredentialsProviderId): Promise<string> {
        let loginResult: Result = 'Succeeded'
        try {
            const provider = await CredentialsProviderManager.getInstance().getCredentialsProvider(
                credentialsProviderId
            )
            if (!provider) {
                throw new Error(`Could not find Credentials Provider for ${asString(credentialsProviderId)}`)
            }

            await this.updateCredentialsStore(credentialsProviderId, provider)

            const storedCredentials = await this.credentialsStore.getCredentials(credentialsProviderId)
            if (!storedCredentials) {
                throw new Error(`No credentials found for id ${asString(credentialsProviderId)}`)
            }

            const credentialsRegion = provider.getDefaultRegion() ?? this.defaultCredentialsRegion
            const accountId = await getAccountId(storedCredentials.credentials, credentialsRegion)
            if (!accountId) {
                throw new Error('Could not determine Account Id for credentials')
            }

            await this.awsContext.setCredentials({
                credentials: storedCredentials.credentials,
                credentialsId: asString(credentialsProviderId),
                accountId: accountId,
                defaultRegion: provider.getDefaultRegion()
            })
            return storedCredentials.credentials.accessKeyId
        } catch (err) {
            loginResult = 'Failed'
            getLogger().error(
                `Error trying to connect to AWS with Credentials Provider ${asString(
                    credentialsProviderId
                )}. Toolkit will now disconnect from AWS.`,
                err as Error
            )
            this.credentialsStore.invalidateCredentials(credentialsProviderId)

            await this.logout()

            this.notifyUserInvalidCredentials(credentialsProviderId)
        } finally {
            recordAwsSetCredentials({ result: loginResult })
        }
        return ''
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
