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
import { CredentialsProviderId, fromString } from './providers/credentialsProviderId'
import { SharedCredentialsProvider } from './providers/sharedCredentialsProvider'
import { CredentialsProviderManager } from './providers/credentialsProviderManager'

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
    const profiles = await CredentialsProviderManager.getInstance().getProfiles()
    const profileNames = Object.keys(profiles)
    const previousCredentialsId = toolkitSettings.readSetting<string>(profileSettingKey, '')
    if (profiles && profileNames.length === 1) {
        // Auto-connect if there is exactly one profile, named "default".
        await loginManager.login(profiles[profileNames[0]])
        // Toast.
        vscode.window.showInformationMessage(`Connected to "${profileNames[0]}"`)
    } else if (previousCredentialsId) {
        // Migrate from older Toolkits - If the last providerId isn't in the new CredentialProviderId format,
        // treat it like a Shared Crdentials Provider.
        const loginCredentialsId = tryMakeCredentialsProviderId(previousCredentialsId) ?? {
            credentialType: SharedCredentialsProvider.getCredentialsType(),
            credentialTypeId: previousCredentialsId
        }
        await loginManager.login(loginCredentialsId)
    } else {
        await loginManager.logout()
    }
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

function tryMakeCredentialsProviderId(credentialsProviderId: string): CredentialsProviderId | undefined {
    try {
        return fromString(credentialsProviderId)
    } catch (err) {
        return undefined
    }
}
