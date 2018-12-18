/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { extensionSettingsPrefix, samAboutInstallUrl } from '../../constants'
import { DefaultSettingsConfiguration } from '../../settingsConfiguration'
import { SamCliConfiguration } from './samCliConfiguration'
import { DefaultSamCliLocationProvider } from './samCliLocator'
const localize = nls.loadMessageBundle()

export async function autoDetectSamCli(showMessageIfDetected: boolean): Promise<void> {
    const samCliConfig = new SamCliConfiguration(
        new DefaultSettingsConfiguration(extensionSettingsPrefix),
        new DefaultSamCliLocationProvider()
    )

    await samCliConfig.initialize()

    const samCliLocation = samCliConfig.getSamCliLocation()

    if (!samCliLocation) {
        notifyUserSamCliNotDetected()
    } else if (showMessageIfDetected) {
        vscode.window.showInformationMessage(
            localize(
                'AWS.samcli.autodetect.settings.updated',
                'Settings updated. SAM CLI found at {0}',
                samCliLocation
            )
        )
    }
}

function notifyUserSamCliNotDetected(): void {
    const learnMore = localize(
        'AWS.samcli.userChoice.visit.install.url',
        'Get SAM CLI'
    )

    const editSettings = localize(
        'AWS.samcli.userChoice.edit.settings',
        'Edit Settings'
    )

    // inform the user, but don't wait for this to complete
    vscode.window.showErrorMessage(
        localize(
            'AWS.samcli.error.notFound',
            // tslint:disable-next-line:max-line-length
            'Unable to find the SAM CLI, which is required to create new Serverless Applications and debug them locally. If you have already installed the SAM CLI, update your User Settings with its location.'
        ),
        learnMore,
        editSettings
    ).then(async userResponse => {
        if (userResponse === learnMore) {
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(samAboutInstallUrl))
        } else if (userResponse === editSettings) {
            await vscode.commands.executeCommand('workbench.action.openGlobalSettings')
        }
    })
}
