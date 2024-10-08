/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Webview } from 'vscode'
import { MessagePublisher } from '../../messages/messagePublisher'
import { MessageListener } from '../../messages/messageListener'
import { TabType } from '../ui/storages/tabsStorage'
import { getLogger } from '../../../shared/logger'
import { amazonqMark } from '../../../shared/performance/marks'
import { telemetry } from '../../../shared/telemetry'
import { AmazonQChatMessageDuration } from '../../messages/chatMessageDuration'

export function dispatchWebViewMessagesToApps(
    webview: Webview,
    webViewToAppsMessagePublishers: Map<TabType, MessagePublisher<any>>
) {
    webview.onDidReceiveMessage((msg) => {
        switch (msg.command) {
            case 'ui-is-ready': {
                /**
                 * ui-is-ready isn't associated to any tab so just record the telemetry event and continue.
                 * This would be equivalent of the duration between "user clicked open q" and "ui has become available"
                 * NOTE: Amazon Q UI is only loaded ONCE. The state is saved between each hide/show of the webview.
                 */

                telemetry.webview_load.emit({
                    webviewName: 'amazonq',
                    duration: performance.measure(amazonqMark.uiReady, amazonqMark.open).duration,
                    result: 'Succeeded',
                })
                performance.clearMarks(amazonqMark.uiReady)
                performance.clearMarks(amazonqMark.open)
                return
            }
            case 'start-chat-message-telemetry': {
                AmazonQChatMessageDuration.startChatMessageTelemetry(msg)
                return
            }
            case 'update-chat-message-telemetry': {
                AmazonQChatMessageDuration.updateChatMessageTelemetry(msg)
                return
            }
            case 'stop-chat-message-telemetry': {
                AmazonQChatMessageDuration.stopChatMessageTelemetry(msg)
                return
            }
        }

        if (msg.type === 'error') {
            const event = msg.event === 'webview_load' ? telemetry.webview_load : telemetry.webview_error
            event.emit({
                webviewName: 'amazonqChat',
                result: 'Failed',
                reasonDesc: msg.errorMessage,
            })
            return
        }

        const appMessagePublisher = webViewToAppsMessagePublishers.get(msg.tabType)
        if (appMessagePublisher === undefined) {
            return
        }
        appMessagePublisher.publish(msg)
    })
}

export function dispatchAppsMessagesToWebView(webView: Webview, appsMessageListener: MessageListener<any>) {
    appsMessageListener.onMessage((msg) => {
        webView.postMessage(JSON.stringify(msg)).then(undefined, (e) => {
            getLogger().error('webView.postMessage failed: %s', (e as Error).message)
        })
    })
}
