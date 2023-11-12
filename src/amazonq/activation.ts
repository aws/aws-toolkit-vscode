/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionContext, commands, window } from 'vscode'
import { AmazonQChatViewProvider } from './webview/webView'
import { init as cwChatAppInit } from '../codewhispererChat/app'
import { init as weaverbirdChatAppInit } from '../weaverbird/app'
import { AmazonQAppInitContext, DefaultAmazonQAppInitContext } from './apps/initContext'
import { weaverbirdEnabled } from '../weaverbird/config'
import { welcome } from './onboardingPage'

export async function activate(context: ExtensionContext) {
    const appInitContext = new DefaultAmazonQAppInitContext()

    registerApps(appInitContext)

    const provider = new AmazonQChatViewProvider(
        context,
        appInitContext.getWebViewToAppsMessagePublishers(),
        appInitContext.getAppsToWebViewMessageListener(),
        appInitContext.onDidChangeAmazonQVisibility
    )

    const cwcWebViewToAppsPublisher = appInitContext.getWebViewToAppsMessagePublishers().get('cwc')!

    context.subscriptions.push(
        window.registerWebviewViewProvider(AmazonQChatViewProvider.viewType, provider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        })
    )

    context.subscriptions.push(
        commands.registerCommand('aws.amazonq.welcome', () => {
            welcome(context, cwcWebViewToAppsPublisher)
        })
    )
}

function registerApps(appInitContext: AmazonQAppInitContext) {
    cwChatAppInit(appInitContext)
    if (weaverbirdEnabled) {
        weaverbirdChatAppInit(appInitContext)
    }
}
