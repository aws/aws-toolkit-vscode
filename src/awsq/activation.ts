/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionContext, window } from 'vscode'
import { AwsQChatViewProvider } from './webview/webView'
import { init as cwChatAppInit } from '../codewhispererChat/app'
import { AwsQAppInitContext, DefaultAwsQAppInitContext } from './apps/initContext'

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

function registerApps(appInitConext: AwsQAppInitContext) {
    cwChatAppInit(appInitConext)
    // TODO: Register Weaverbird
}
