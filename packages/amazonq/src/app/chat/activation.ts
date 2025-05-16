/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ExtensionContext } from 'vscode'
import { telemetry } from 'aws-core-vscode/telemetry'
import { AuthUtil } from 'aws-core-vscode/codewhisperer'
import { Commands, placeholder } from 'aws-core-vscode/shared'
import * as amazonq from 'aws-core-vscode/amazonq'

export async function activate(context: ExtensionContext) {
    const appInitContext = amazonq.DefaultAmazonQAppInitContext.instance
    await amazonq.TryChatCodeLensProvider.register(appInitContext.onDidChangeAmazonQVisibility.event)

    context.subscriptions.push(
        amazonq.focusAmazonQChatWalkthrough.register(),
        amazonq.walkthroughInlineSuggestionsExample.register(),
        amazonq.walkthroughSecurityScanExample.register(),
        amazonq.openAmazonQWalkthrough.register(),
        amazonq.listCodeWhispererCommandsWalkthrough.register(),
        amazonq.focusAmazonQPanel.register(),
        amazonq.focusAmazonQPanelKeybinding.register(),
        amazonq.tryChatCodeLensCommand.register()
    )

    Commands.register('aws.amazonq.learnMore', () => {
        void vscode.env.openExternal(vscode.Uri.parse(amazonq.amazonQHelpUrl))
    })

    void setupAuthNotification()
}

/**
 * Display a notification to user for Log In.
 *
 * Authentication Notification is displayed when:
 * - User is not authenticated
 * - Once every session
 *
 */
async function setupAuthNotification() {
    let notificationDisplayed = false // Auth Notification should be displayed only once.
    await tryShowNotification()

    async function tryShowNotification() {
        // Do not show the notification if the IDE starts and user is already authenticated.
        if (AuthUtil.instance.isConnected()) {
            notificationDisplayed = true
        }

        if (notificationDisplayed) {
            return
        }

        const source = 'authNotification'
        const buttonAction = 'Sign In'
        notificationDisplayed = true

        telemetry.toolkit_showNotification.emit({
            component: 'editor',
            id: source,
            reason: 'notLoggedIn',
            result: 'Succeeded',
        })
        const selection = await vscode.window.showWarningMessage('Start using Amazon Q', buttonAction)

        if (selection === buttonAction) {
            void amazonq.focusAmazonQPanel.execute(placeholder, source)
        }
    }
}
