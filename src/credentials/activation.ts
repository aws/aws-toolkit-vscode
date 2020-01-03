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
    const previousCredentialsId = toolkitSettings.readSetting(profileSettingKey, '')
    if (previousCredentialsId) {
        await loginManager.login(previousCredentialsId)
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
