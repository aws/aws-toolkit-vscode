/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { Webview } from 'vscode'
import { MessagePublisher } from '../../messages/messagePublisher'
import { MessageListener } from '../../messages/messageListener'
import { TabType } from '../ui/storages/tabsStorage'
import { startTransformByQWithProgress } from '../../../codewhisperer/commands/startTransformByQ'
import { transformByQState } from '../../../codewhisperer/models/model'
import * as CodeWhispererConstants from '../../../codewhisperer/models/constants'

export function dispatchWebViewMessagesToApps(
    webview: Webview,
    webViewToAppsMessagePublishers: Map<TabType, MessagePublisher<any>>
) {
    webview.onDidReceiveMessage(msg => {
        if (msg.command === 'transform') {
            if (transformByQState.isNotStarted()) {
                startTransformByQWithProgress()
            } else {
                vscode.window.showInformationMessage(CodeWhispererConstants.jobInProgressMessage)
            }
        } else {
            const appMessagePublisher = webViewToAppsMessagePublishers.get(msg.tabType)
            if (appMessagePublisher === undefined) {
                return
            }
            appMessagePublisher.publish(msg)
        }
    })
}

export function dispatchAppsMessagesToWebView(webView: Webview, appsMessageListener: MessageListener<any>) {
    appsMessageListener.onMessage(msg => {
        webView.postMessage(JSON.stringify(msg))
    })
}
