/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AwsContext } from '../shared/awsContext'
import { profileSettingKey } from '../shared/constants'
import { CredentialsProfileMru } from '../shared/credentials/credentialsProfileMru'
import { SettingsConfiguration } from '../shared/settingsConfiguration'
import { LoginManager } from './loginManager'
import { asString, CredentialsId, fromString } from './providers/credentials'
import { CredentialsProviderManager } from './providers/credentialsProviderManager'
import { SharedCredentialsProvider } from './providers/sharedCredentialsProvider'
import { getIdeProperties } from '../shared/extensionUtilities'

import * as nls from 'vscode-nls'
import { isCloud9 } from '../shared/extensionUtilities'
import { getLogger } from '../shared/logger/logger'
const localize = nls.loadMessageBundle()

export interface CredentialsInitializeParameters {
    extensionContext: vscode.ExtensionContext
    awsContext: AwsContext
    settingsConfiguration: SettingsConfiguration
}

export async function initialize(parameters: CredentialsInitializeParameters): Promise<void> {
    updateMruWhenAwsContextChanges(parameters.awsContext, parameters.extensionContext)
    updateConfigurationWhenAwsContextChanges(
        parameters.settingsConfiguration,
        parameters.awsContext,
        parameters.extensionContext
    )
}

export async function loginWithMostRecentCredentials(
    toolkitSettings: SettingsConfiguration,
    loginManager: LoginManager
): Promise<void> {
    const manager = CredentialsProviderManager.getInstance()
    const previousCredentialsId = toolkitSettings.readSetting<string>(profileSettingKey, '')

    async function tryConnect(creds: CredentialsId, popup: boolean): Promise<boolean> {
        const provider = await manager.getCredentialsProvider(creds)
        // 'provider' may be undefined if the last-used credentials no longer exists.
        if (!provider) {
            getLogger().warn('autoconnect: getCredentialsProvider() lookup failed for profile: %O', asString(creds))
        } else if (provider.canAutoConnect()) {
            if (!(await loginManager.login({ passive: true, providerId: creds }))) {
                getLogger().warn('autoconnect: failed to connect: %O', asString(creds))
                return false
            }
            getLogger().info('autoconnect: connected: %O', asString(creds))
            if (popup) {
                vscode.window.showInformationMessage(
                    localize(
                        'AWS.message.credentials.connected',
                        'Connected to {0} with {1}',
                        getIdeProperties().company,
                        asString(creds)
                    )
                )
            }
            return true
        }
        return false
    }

    // Auto-connect if there is a recently-used profile.
    if (previousCredentialsId) {
        // Migrate from old Toolkits: default to "shared" provider type.
        const loginCredentialsId = tryMakeCredentialsProviderId(previousCredentialsId) ?? {
            credentialSource: SharedCredentialsProvider.getProviderType(),
            credentialTypeId: previousCredentialsId,
        }
        if (await tryConnect(loginCredentialsId, false)) {
            return
        }
    }

    const providerMap = await manager.getCredentialProviderNames()
    const profileNames = Object.keys(providerMap)
    // Look for "default" profile or exactly one (any name).
    const defaultProfile = profileNames.includes('profile:default')
        ? 'profile:default'
        : profileNames.length === 1
        ? profileNames[0]
        : undefined

    if (!previousCredentialsId && !defaultProfile) {
        await loginManager.logout(true)
        getLogger().info('autoconnect: skipped (profileNames=%d)', profileNames.length)
        return
    }

    // Auto-connect if there is a default profile.
    if (defaultProfile) {
        getLogger().debug('autoconnect: trying "%s"', defaultProfile)
        if (await tryConnect(providerMap[defaultProfile], !isCloud9())) {
            return
        }
    }

    await loginManager.logout(true)
}

function updateMruWhenAwsContextChanges(awsContext: AwsContext, extensionContext: vscode.ExtensionContext) {
    extensionContext.subscriptions.push(
        awsContext.onDidChangeContext(async awsContextChangedEvent => {
            if (!awsContextChangedEvent.profileName) {
                return
            }

            const mru = new CredentialsProfileMru(extensionContext)
            await mru.setMostRecentlyUsedProfile(awsContextChangedEvent.profileName)
        })
    )
}

/**
 * Saves the active credentials to VS Code Settings whenever they change.
 */
function updateConfigurationWhenAwsContextChanges(
    settingsConfiguration: SettingsConfiguration,
    awsContext: AwsContext,
    extensionContext: vscode.ExtensionContext
) {
    extensionContext.subscriptions.push(
        awsContext.onDidChangeContext(async awsContextChangedEvent => {
            await settingsConfiguration.writeSetting(
                profileSettingKey,
                awsContextChangedEvent.profileName,
                vscode.ConfigurationTarget.Global
            )
        })
    )
}

function tryMakeCredentialsProviderId(credentials: string): CredentialsId | undefined {
    try {
        return fromString(credentials)
    } catch (err) {
        return undefined
    }
}
