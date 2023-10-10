/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Webview } from 'vscode'
import { MessagePublisher } from '../../messages/messagePublisher'
import { MessageListener } from '../../messages/messageListener'

export function dispatchWebViewMessagesToApps(
    webview: Webview,
    WebViewToAppsMessagePublishers: MessagePublisher<any>[]
) {
    webview.onDidReceiveMessage(msg => {
        WebViewToAppsMessagePublishers.forEach(publisher => {
            publisher.publish(msg)
        })
    })
}

export function dispatchAppsMessagesToWebView(webView: Webview, appsMessageListener: MessageListener<any>) {
    appsMessageListener.onMessage(msg => {
        webView.postMessage(JSON.stringify(msg))
    })
}
