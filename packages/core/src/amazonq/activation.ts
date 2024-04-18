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
import { Commands } from '../shared/vscode/commands2'
import { activateBadge } from './util/viewBadgeHandler'
import { amazonQHelpUrl } from '../shared/constants'

export async function activate(context: ExtensionContext) {
    const appInitContext = DefaultAmazonQAppInitContext.instance

    registerApps(appInitContext)

    const provider = new AmazonQChatViewProvider(
        context,
        appInitContext.getWebViewToAppsMessagePublishers(),
        appInitContext.getAppsToWebViewMessageListener(),
        appInitContext.onDidChangeAmazonQVisibility
    )

    context.subscriptions.push(
        window.registerWebviewViewProvider(AmazonQChatViewProvider.viewType, provider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        })
    )

    Commands.register('aws.amazonq.learnMore', () => {
        void vscode.env.openExternal(vscode.Uri.parse(amazonQHelpUrl))
    })

    await activateBadge()
}

function registerApps(appInitContext: AmazonQAppInitContext) {
    cwChatAppInit(appInitContext)
    featureDevChatAppInit(appInitContext)
    gumbyChatAppInit(appInitContext)
}
