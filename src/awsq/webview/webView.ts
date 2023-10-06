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
} from 'vscode'
import { registerAssetsHttpsFileSystem } from './assets/assetsHandler'
import { WebViewContentGenerator } from './generators/webViewContent'
import { ActionListener } from './actions/actionListener'
import { Connector } from './connector/connector'
import { EventEmitter } from 'stream'

export class AwsQChatViewProvider implements WebviewViewProvider {
    public static readonly viewType = 'aws.AWSQChatView'

    webViewContentGenerator: WebViewContentGenerator
    actionListener: ActionListener
    connector: Connector | undefined
    webView: Webview | undefined

    constructor(
        private readonly extensionContext: ExtensionContext,
        private readonly cwChatUIInputEventEmitter: EventEmitter,
        private readonly uiConnectorEventEmitter: EventEmitter
    ) {
        registerAssetsHttpsFileSystem(extensionContext)
        this.webViewContentGenerator = new WebViewContentGenerator()
        this.actionListener = new ActionListener()
    }

    public resolveWebviewView(webviewView: WebviewView, context: WebviewViewResolveContext, _token: CancellationToken) {
        const dist = Uri.joinPath(this.extensionContext.extensionUri, 'dist')
        const resources = Uri.joinPath(this.extensionContext.extensionUri, 'resources')
        webviewView.webview.options = {
            enableScripts: true,
            enableCommandUris: true,
            localResourceRoots: [dist, resources],
        }

        this.actionListener.bind({
            webview: webviewView.webview,
            cwChatUIInputEventEmitter: this.cwChatUIInputEventEmitter,
        })
        this.connector = new Connector(webviewView.webview, this.uiConnectorEventEmitter)

        webviewView.webview.html = this.webViewContentGenerator.generate(
            this.extensionContext.extensionUri,
            webviewView.webview
        )
    }
}
