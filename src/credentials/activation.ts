/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AwsContext } from '../shared/awsContext'
import { profileSettingKey } from '../shared/constants'
import { CredentialsProfileMru } from '../shared/credentials/credentialsProfileMru'
import { Settings } from '../shared/settings'
import { CredentialsSettings } from './credentialsUtilities'

export async function initialize(
    extensionContext: vscode.ExtensionContext,
    awsContext: AwsContext,
    settings: Settings
): Promise<void> {
    const credentialSettings = new CredentialsSettings(settings)
    updateMruWhenAwsContextChanges(awsContext, extensionContext)
    updateConfigurationWhenAwsContextChanges(credentialSettings, awsContext, extensionContext)
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
    settings: CredentialsSettings,
    awsContext: AwsContext,
    extensionContext: vscode.ExtensionContext
) {
    extensionContext.subscriptions.push(
        awsContext.onDidChangeContext(async awsContextChangedEvent => {
            if (awsContextChangedEvent.profileName) {
                await settings.update(profileSettingKey, awsContextChangedEvent.profileName)
            } else {
                await settings.delete(profileSettingKey)
            }
        })
    )
}
