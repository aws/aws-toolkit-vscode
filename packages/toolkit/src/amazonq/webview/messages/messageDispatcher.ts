/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Webview } from 'vscode'
import { MessagePublisher } from '../../messages/messagePublisher'
import { MessageListener } from '../../messages/messageListener'
import { TabType } from '../ui/storages/tabsStorage'
import { getLogger } from '../../../shared/logger'

export function dispatchWebViewMessagesToApps(
    webview: Webview,
    webViewToAppsMessagePublishers: Map<TabType, MessagePublisher<any>>
) {
    webview.onDidReceiveMessage(msg => {
        const appMessagePublisher = webViewToAppsMessagePublishers.get(msg.tabType)
        if (appMessagePublisher === undefined) {
            return
        }
        appMessagePublisher.publish(msg)
    })
}

export function dispatchAppsMessagesToWebView(webView: Webview, appsMessageListener: MessageListener<any>) {
    appsMessageListener.onMessage(msg => {
        webView.postMessage(JSON.stringify(msg)).then(undefined, e => {
            getLogger().error('webView.postMessage failed: %s', (e as Error).message)
        })
    })
}
