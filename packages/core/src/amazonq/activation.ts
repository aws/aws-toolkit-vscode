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
import { LspController } from './lsp/lspController'
import { Auth } from '../auth'
import { telemetry } from '../shared/telemetry'
import { CodeWhispererSettings } from '../codewhisperer/util/codewhispererSettings'
import { debounce } from '../shared/utilities/functionUtils'

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

    const setupLsp = debounce(async () => {
        void LspController.instance.trySetupLsp(context)
    }, 5000)

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
        tryChatCodeLensCommand.register(),
        vscode.workspace.onDidChangeConfiguration(async (configurationChangeEvent) => {
            if (configurationChangeEvent.affectsConfiguration('amazonQ.workspaceIndex')) {
                if (CodeWhispererSettings.instance.isLocalIndexEnabled()) {
                    void setupLsp()
                }
            }
        })
    )

    Commands.register('aws.amazonq.learnMore', () => {
        void vscode.env.openExternal(vscode.Uri.parse(amazonQHelpUrl))
    })

    await activateBadge()
    void setupLsp()
    void setupAuthNotification()
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
 * - User is not authenticated
 * - Once every session
 *
 */
async function setupAuthNotification() {
    let notificationDisplayed = false // Auth Notification should be displayed only once.
    await tryShowNotification()

    async function tryShowNotification() {
        // Do not show the notification if the IDE starts and user is already authenticated.
        if (Auth.instance.activeConnection) {
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
            void focusAmazonQPanel.execute(placeholder, source)
        }
    }
}
