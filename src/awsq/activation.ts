/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionContext, window } from 'vscode'
import { AwsQChatViewProvider } from './webview/webView'
import { init as cwChatAppInit } from '../codewhispererChat/app'
import { init as weaverbirdChatAppInit } from '../weaverbird/app'
import { AwsQAppInitContext, DefaultAwsQAppInitContext } from './apps/initContext'
import { weaverbirdEnabled } from '../weaverbird/config'

export async function activate(context: ExtensionContext) {
    const appInitConext = new DefaultAwsQAppInitContext()

    registerApps(appInitConext)

    const provider = new AwsQChatViewProvider(
        context,
        appInitConext.getWebViewToAppsMessagePublishers(),
        appInitConext.getAppsToWebViewMessageListener()
    )

    context.subscriptions.push(
        window.registerWebviewViewProvider(AwsQChatViewProvider.viewType, provider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        })
    )
}

function registerApps(appInitContext: AwsQAppInitContext) {
    cwChatAppInit(appInitContext)
    if (weaverbirdEnabled) {
        weaverbirdChatAppInit(appInitContext)
    }
}
