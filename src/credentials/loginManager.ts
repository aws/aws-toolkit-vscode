/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AwsContext } from '../shared/awsContext'
import { extensionSettingsPrefix, profileSettingKey } from '../shared/constants'
import { getAccountId } from '../shared/credentials/accountId'
import { getLogger } from '../shared/logger'
import { DefaultSettingsConfiguration, SettingsConfiguration } from '../shared/settingsConfiguration'
import { recordAwsSetCredentials } from '../shared/telemetry/telemetry'
import { localize } from '../shared/utilities/vsCodeUtils'
import { CredentialsStore } from './credentialsStore'
import { notifyUserInvalidCredentials } from './credentialsUtilities'
import { CredentialsProvider } from './providers/credentialsProvider'
import { asString, CredentialsProviderId, fromString } from './providers/credentialsProviderId'
import { CredentialsProviderManager } from './providers/credentialsProviderManager'
import { SharedCredentialsProvider } from './providers/sharedCredentialsProvider'

let didTryAutoConnect = false

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
     * @returns True if the toolkit could connect with the providerId
     */

    public async login(args: { passive: boolean; providerId: CredentialsProviderId }): Promise<boolean> {
        let provider: CredentialsProvider | undefined
        try {
            provider = await CredentialsProviderManager.getInstance().getCredentialsProvider(args.providerId)
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

            return true
        } catch (err) {
            // TODO: don't hardcode logic using error message, have a 'type' field instead
            if (!(err as Error).message.includes('cancel')) {
                notifyUserInvalidCredentials(args.providerId)
                getLogger().error(
                    `Error trying to connect to AWS with Credentials Provider ${asString(
                        args.providerId
                    )}. Toolkit will now disconnect from AWS. %O`,
                    err as Error
                )
            } else {
                getLogger().info(`Cancelled getting credentials from provider: ${asString(args.providerId)}`)
            }

            await this.logout()
            this.store.invalidateCredentials(args.providerId)
            return false
        } finally {
            const credType = provider?.getCredentialsType2()
            this.recordAwsSetCredentialsFn({
                passive: args.passive,
                credentialType: credType,
            })
        }
    }

    /**
     * Removes Credentials from the Toolkit. Essentially the Toolkit becomes "logged out".
     */
    public async logout(): Promise<void> {
        await this.awsContext.setCredentials(undefined)
    }
}

/**
 * Connects last-used AWS credentials, if not already attempted in the current session.
 *
 * @returns true if login succeeded or credentials exist; false if login failed
 * or was already tried this session.
 */
export async function tryAutoLogin(awsContext: AwsContext): Promise<boolean> {
    let creds = await awsContext.getCredentials() // Current credentials?
    if (creds) {
        return true
    }
    if (didTryAutoConnect) {
        return false
    }
    didTryAutoConnect = true
    const toolkitSettings = new DefaultSettingsConfiguration(extensionSettingsPrefix)
    const loginManager = new LoginManager(awsContext, new CredentialsStore())
    await loginWithMostRecentCredentials(toolkitSettings, loginManager)
    creds = await awsContext.getCredentials() // Connected credentials?
    return !!creds
}

export async function loginWithMostRecentCredentials(
    toolkitSettings: SettingsConfiguration,
    loginManager: LoginManager
): Promise<void> {
    const manager = CredentialsProviderManager.getInstance()
    const providerMap = await manager.getCredentialProviderNames()
    const profileNames = Object.keys(providerMap)
    const previousCredentialsId = toolkitSettings.readSetting<string>(profileSettingKey, '')

    if (previousCredentialsId) {
        // Migrate from older Toolkits - If the last providerId isn't in the new CredentialProviderId format,
        // treat it like a Shared Crdentials Provider.
        let loginCredentialsId
        try {
            loginCredentialsId = fromString(previousCredentialsId)
        } catch (err) {
            loginCredentialsId = {
                credentialType: SharedCredentialsProvider.getCredentialsType(),
                credentialTypeId: previousCredentialsId,
            }
        }
        const provider = await manager.getCredentialsProvider(loginCredentialsId)

        // 'provider' may be undefined if the last-used credentials no longer exists.
        if (provider && provider.canAutoConnect()) {
            await loginManager.login({ passive: true, providerId: loginCredentialsId })
        } else {
            await loginManager.logout()
        }
    } else if (
        providerMap &&
        profileNames.length === 1 &&
        (await manager.getCredentialsProvider(providerMap[profileNames[0]]))!.canAutoConnect()
    ) {
        // Auto-connect if there is exactly one profile.
        if (await loginManager.login({ passive: true, providerId: providerMap[profileNames[0]] })) {
            // Toast.
            vscode.window.showInformationMessage(
                localize('AWS.message.credentials.connected', 'Connected to AWS as {0}', profileNames[0])
            )
        }
    } else {
        await loginManager.logout()
    }
}
