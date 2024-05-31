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
import { focusAmazonQChatWalkthrough, openAmazonQWalkthrough } from './onboardingPage/walkthrough'
import { listCodeWhispererCommandsWalkthrough } from '../codewhisperer/ui/statusBarMenu'
import { Commands } from '../shared/vscode/commands2'
import { focusAmazonQPanel, focusAmazonQPanelKeybinding } from '../codewhispererChat/commands/registerCommands'
import { TryChatCodeLensProvider, tryChatCodeLensCommand } from '../codewhispererChat/editor/codelens'
import { activate as activateLsp } from './lsp/lspClient'
import { Search } from './search'
import { CodeWhispererSettings } from '../codewhisperer/util/codewhispererSettings'
import { getLogger } from '../shared'
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

    if (CodeWhispererSettings.instance.isLocalIndexEnabled()) {
        Search.instance.installLspZip().then(() => {
            setImmediate(() =>
                activateLsp(context).then(() => {
                    getLogger().info('LSP activated')
                    Search.instance.buildIndex()
                })
            )
        })
    }
}

function registerApps(appInitContext: AmazonQAppInitContext) {
    cwChatAppInit(appInitContext)
    featureDevChatAppInit(appInitContext)
    gumbyChatAppInit(appInitContext)
}
