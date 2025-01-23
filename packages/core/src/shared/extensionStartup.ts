/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import * as vscode from 'vscode'
import * as semver from 'semver'
import { getIdeType, isAmazonQ, productName } from './extensionUtilities'
import * as localizedText from './localizedText'
import { AmazonQPromptSettings, ToolkitPromptSettings } from './settings'
import { showMessage } from './utilities/messages'
import { getTelemetryReasonDesc } from './errors'

/**
 * Shows a (suppressible) warning if the current vscode version is older than `minVscode`.
 */
export async function maybeShowMinVscodeWarning(minVscode: string) {
    const settings = isAmazonQ() ? AmazonQPromptSettings.instance : ToolkitPromptSettings.instance
    if (!settings.isPromptEnabled('minIdeVersion')) {
        return
    }
    const updateButton = `Update ${vscode.env.appName}`
    const msg = `${productName()} will soon require VS Code ${minVscode} or newer. The currently running version ${vscode.version} will no longer receive updates.`
    if (getIdeType() === 'vscode' && semver.lt(vscode.version, minVscode)) {
        void showMessage(
            'warn',
            msg,
            [updateButton, localizedText.dontShow],
            {},
            {
                id: 'maybeShowMinVscodeWarning',
                reasonDesc: getTelemetryReasonDesc(msg),
            }
        ).then(async (resp) => {
            if (resp === updateButton) {
                await vscode.commands.executeCommand('update.checkForUpdate')
            } else if (resp === localizedText.dontShow) {
                void settings.disablePrompt('minIdeVersion')
            }
        })
    }
}
