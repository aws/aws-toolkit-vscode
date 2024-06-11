/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ExtensionContext, window } from 'vscode'
import { AmazonQChatViewProvider } from './webview/webView'
import { init as cwChatAppInit } from '../codewhispererChat/app'
import { init as featureDevChatAppInit } from '../amazonqFeatureDev/app'
import { init as gumbyChatAppInit } from '../amazonqGumby/app'
import { AmazonQAppInitContext, DefaultAmazonQAppInitContext } from './apps/initContext'
import { activateBadge } from './util/viewBadgeHandler'
import { amazonQHelpUrl } from '../shared/constants'
import {
    focusAmazonQChatWalkthrough,
    openAmazonQWalkthrough,
    walkthroughInlineSuggestionsExample,
    walkthroughSecurityScanExample,
} from './onboardingPage/walkthrough'
import { listCodeWhispererCommandsWalkthrough } from '../codewhisperer/ui/statusBarMenu'
import { Commands, placeholder } from '../shared/vscode/commands2'
import { focusAmazonQPanel, focusAmazonQPanelKeybinding } from '../codewhispererChat/commands/registerCommands'
import { TryChatCodeLensProvider, tryChatCodeLensCommand } from '../codewhispererChat/editor/codelens'
import { Auth } from '../auth'
import { learnMoreUri } from '../codewhisperer/models/constants'
import { openUrl } from '../shared/utilities/vsCodeUtils'
import { AuthUtil } from '../codewhisperer'
import { ConnectionStateChangeEvent } from '../auth/auth'
import { telemetry } from '../shared/telemetry'

export async function activate(context: ExtensionContext) {
    const appInitContext = DefaultAmazonQAppInitContext.instance

    registerApps(appInitContext)

    const provider = new AmazonQChatViewProvider(
        context,
        appInitContext.getWebViewToAppsMessagePublishers(),
        appInitContext.getAppsToWebViewMessageListener(),
        appInitContext.onDidChangeAmazonQVisibility
    )

    await TryChatCodeLensProvider.register(appInitContext.onDidChangeAmazonQVisibility.event)

    context.subscriptions.push(
        window.registerWebviewViewProvider(AmazonQChatViewProvider.viewType, provider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        }),
        focusAmazonQChatWalkthrough.register(),
        walkthroughInlineSuggestionsExample.register(),
        walkthroughSecurityScanExample.register(),
        openAmazonQWalkthrough.register(),
        listCodeWhispererCommandsWalkthrough.register(),
        focusAmazonQPanel.register(),
        focusAmazonQPanelKeybinding.register(),
        tryChatCodeLensCommand.register()
    )

    Commands.register('aws.amazonq.learnMore', () => {
        void vscode.env.openExternal(vscode.Uri.parse(amazonQHelpUrl))
    })

    await activateBadge()
    void setupAuthNotification(
        appInitContext.onDidChangeAmazonQVisibility.event,
        Auth.instance.onDidChangeConnectionState
    )
}

function registerApps(appInitContext: AmazonQAppInitContext) {
    cwChatAppInit(appInitContext)
    featureDevChatAppInit(appInitContext)
    gumbyChatAppInit(appInitContext)
}

/**
 * Display a notification to user for Log In.
 *
 * Authentication Notification is displayed when:
 * - The user closes the Amazon Q chat panel, and
 * - The user has not performed any authentication action.
 *
 * Error Notification is displayed when:
 * - The user closes the Amazon Q chat panel, and
 * - The user attempts an authentication action but is not logged in.
 *
 * @param {Event} onAmazonQChatVisibility - Event indicating the visibility status of the Amazon Q chat.
 * @param {Event} onDidUpdateConnection - Event indicating the authentication connection update.
 */
async function setupAuthNotification(
    onAmazonQChatVisibility: vscode.Event<boolean>,
    onDidUpdateConnection: vscode.Event<ConnectionStateChangeEvent | undefined>
) {
    let isAmazonQVisible = true // Assume Chat is open by default.
    let notificationDisplayed = false // Auth Notification should be displayed only once.
    let authConnection: ConnectionStateChangeEvent

    // Updates the visibility state of the Amazon Q chat.
    const updateVisibility = async (visible: boolean) => {
        isAmazonQVisible = visible
        await tryShowNotification()
    }

    // Updates the source of the connection for Amazon Q sign in.
    const updateConnection = async (connection: ConnectionStateChangeEvent | undefined) => {
        if (connection) {
            authConnection = connection
            await tryShowNotification()
        }
    }

    const disposables: vscode.Disposable[] = [
        onAmazonQChatVisibility(updateVisibility),
        onDidUpdateConnection(updateConnection),
    ]

    async function tryShowNotification() {
        if (notificationDisplayed || Auth.instance.activeConnection) {
            return
        }

        const source = 'authNotification'

        if (!isAmazonQVisible && !authConnection && !AuthUtil.instance.isConnectionExpired()) {
            const buttonAction = 'Sign In'
            notificationDisplayed = true
            disposables.forEach(item => item.dispose())

            telemetry.toolkit_showNotification.emit({
                component: 'editor',
                id: source,
                reason: 'notLoggedIn',
                result: 'Succeeded',
            })
            const selection = await vscode.window.showWarningMessage('Start using Amazon Q', buttonAction)

            if (selection === buttonAction) {
                void focusAmazonQPanel.execute(placeholder, source)
            }
        } else if (!isAmazonQVisible && authConnection.state === 'authenticating') {
            const buttonAction = 'Open documentation'
            notificationDisplayed = true
            disposables.forEach(item => item.dispose())

            telemetry.toolkit_showNotification.emit({
                component: 'editor',
                id: source,
                reason: 'authenticating',
                result: 'Succeeded',
            })
            const selection = await vscode.window.showWarningMessage(
                'See Amazon Q documentation for help on signing in',
                buttonAction
            )

            if (selection === buttonAction) {
                void openUrl(vscode.Uri.parse(`${learnMoreUri}#q-in-IDE-setup-bid`), source)
            }
        }
    }
}
