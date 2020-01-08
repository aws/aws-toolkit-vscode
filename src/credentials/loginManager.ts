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
import { CredentialsStore } from './credentialsStore'
import { CredentialsProvider } from './providers/credentialsProvider'
import { getCredentialsProviderManagerInstance } from './providers/credentialsProviderManager'

export class LoginManager {
    private readonly credentialsStore: CredentialsStore = new CredentialsStore()

    public constructor(private readonly awsContext: AwsContext) {}

    /**
     * Establishes a Credentials for the Toolkit to use. Essentially the Toolkit becomes "logged in".
     * If an error occurs while trying to set up and verify these credentials, the Toolkit is "logged out".
     */
    public async login(credentialsId: string): Promise<void> {
        try {
            const provider = await getCredentialsProviderManagerInstance().getCredentialsProvider(credentialsId)
            if (!provider) {
                throw new Error(`Could not find Credentials Provider for ${credentialsId}`)
            }

            await this.updateCredentialsStore(credentialsId, provider)

            const credentials = await this.credentialsStore.getCredentials(credentialsId)
            if (!credentials) {
                throw new Error(`No credentials found for id ${credentialsId}`)
            }

            // TODO : Get a region relevant to the partition for these credentials -- https://github.com/aws/aws-toolkit-vscode/issues/188
            const accountId = await getAccountId(credentials, 'us-east-1')
            if (!accountId) {
                throw new Error('Could not determine Account Id for credentials')
            }

            await this.awsContext.setCredentials({
                credentials: credentials,
                credentialsId: credentialsId,
                accountId: accountId,
                defaultRegion: provider.getDefaultRegion()
            })
        } catch (err) {
            getLogger().error(
                `Error trying to connect to AWS with Credentials Provider ${credentialsId}. Toolkit will now disconnect from AWS.`,
                err as Error
            )
            this.credentialsStore.invalidateCredentials(credentialsId)

            await this.logout()

            this.notifyUserInvalidCredentials(credentialsId)
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
    private async updateCredentialsStore(credentialsId: string, provider: CredentialsProvider): Promise<void> {
        const currentHash = this.credentialsStore.getCredentialsHashCode(credentialsId)
        if (provider.getHashCode() !== currentHash) {
            getLogger().verbose(`Credentials for ${credentialsId} have changed, using updated credentials.`)
            this.credentialsStore.invalidateCredentials(credentialsId)
        }

        await this.credentialsStore.getCredentialsOrCreate(credentialsId, async () => {
            return {
                credentials: await provider.getCredentials(),
                credentialsHashCode: provider.getHashCode()
            }
        })
    }

    private notifyUserInvalidCredentials(credentialProviderId: string) {
        const getHelp = localize('AWS.message.credentials.invalid.help', 'Get Help...')
        const viewLogs = localize('AWS.message.credentials.invalid.logs', 'View logs...')

        vscode.window
            .showErrorMessage(
                localize(
                    'AWS.message.credentials.invalid',
                    'Invalid Credentials {0}, see logs for more information.',
                    credentialProviderId
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
