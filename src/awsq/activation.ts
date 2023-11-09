/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionContext, commands, window } from 'vscode'
import { AwsQChatViewProvider } from './webview/webView'
import { init as cwChatAppInit } from '../codewhispererChat/app'
import { init as weaverbirdChatAppInit } from '../weaverbird/app'
import { AwsQAppInitContext, DefaultAwsQAppInitContext } from './apps/initContext'
import { weaverbirdEnabled } from '../weaverbird/config'
import { welcome } from './welcome'

export async function activate(context: ExtensionContext) {
    const appInitContext = new DefaultAwsQAppInitContext()

    registerApps(appInitContext)

    const provider = new AwsQChatViewProvider(
        context,
        appInitContext.getWebViewToAppsMessagePublishers(),
        appInitContext.getAppsToWebViewMessageListener()
    )

    const p = appInitContext.getWebViewToAppsMessagePublishers().get('cwc')!

    context.subscriptions.push(
        window.registerWebviewViewProvider(AwsQChatViewProvider.viewType, provider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        })
    )

    context.subscriptions.push(
        commands.registerCommand('aws.awsq.welcome', () => {
            welcome(context, p)
        })
    )
}

function registerApps(appInitContext: AwsQAppInitContext) {
    cwChatAppInit(appInitContext)
    if (weaverbirdEnabled) {
        weaverbirdChatAppInit(appInitContext)
    }
}
