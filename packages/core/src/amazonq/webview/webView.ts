/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    WebviewViewProvider,
    ExtensionContext,
    WebviewView,
    WebviewViewResolveContext,
    CancellationToken,
    Uri,
    Webview,
    EventEmitter,
} from 'vscode'
import { registerAssetsHttpsFileSystem } from './assets/assetsHandler'
import { WebViewContentGenerator } from './generators/webViewContent'
import { dispatchAppsMessagesToWebView, dispatchWebViewMessagesToApps } from './messages/messageDispatcher'
import { MessageListener } from '../messages/messageListener'
import { MessagePublisher } from '../messages/messagePublisher'
import { TabType } from './ui/storages/tabsStorage'
import { amazonqMark } from '../../shared/performance/marks'

export class AmazonQChatViewProvider implements WebviewViewProvider {
    public static readonly viewType = 'aws.AmazonQChatView'

    webViewContentGenerator: WebViewContentGenerator
    webView: Webview | undefined

    constructor(
        private readonly extensionContext: ExtensionContext,
        private readonly webViewToAppsMessagesPublishers: Map<TabType, MessagePublisher<any>>,
        private readonly appsMessagesListener: MessageListener<any>,
        private readonly onDidChangeAmazonQVisibility: EventEmitter<boolean>
    ) {
        registerAssetsHttpsFileSystem(extensionContext)
        this.webViewContentGenerator = new WebViewContentGenerator()
    }

    public async resolveWebviewView(
        webviewView: WebviewView,
        context: WebviewViewResolveContext,
        _token: CancellationToken
    ) {
        webviewView.onDidChangeVisibility(() => {
            this.onDidChangeAmazonQVisibility.fire(webviewView.visible)
        })

        const dist = Uri.joinPath(this.extensionContext.extensionUri, 'dist')
        const resources = Uri.joinPath(this.extensionContext.extensionUri, 'resources')
        webviewView.webview.options = {
            enableScripts: true,
            enableCommandUris: true,
            localResourceRoots: [dist, resources],
        }

        dispatchWebViewMessagesToApps(webviewView.webview, this.webViewToAppsMessagesPublishers)

        dispatchAppsMessagesToWebView(webviewView.webview, this.appsMessagesListener)

        webviewView.webview.html = await this.webViewContentGenerator.generate(
            this.extensionContext.extensionUri,
            webviewView.webview
        )

        performance.mark(amazonqMark.open)
    }
}
