/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/*
UX. This should be a node under the activity bar. 
"viewsContainers": {
            "activitybar": [
                {
                    "id": "aws-explorer",
                    "title": "%AWS.title%",
                    "icon": "resources/aws-logo.svg",
                    "cloud9": {
                        "cn": {
                            "title": "%AWS.title.cn%",
                            "icon": "resources/aws-cn-logo.svg"
                        }
                    }
                },

Cannot reuse the auth vue, because they are webview panels which are custom editor.
The design is in the sidebar. It should use webview view.                 

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
import { CommonAuthWebViewContentGenerator } from './commonAuthWebViewContentGenerator'
import {
    dispatchAppsMessagesToWebView,
    dispatchWebViewMessagesToApps,
} from '../../amazonq/webview/messages/messageDispatcher'
import { MessageListener } from '../../amazonq/messages/messageListener'
import { MessagePublisher } from '../../amazonq/messages/messagePublisher'
import { registerAssetsHttpsFileSystem } from '../../amazonq/webview/assets/assetsHandler'
import { TabType } from '../../amazonq/webview/ui/storages/tabsStorage'

export class CommonAuthViewProvider implements WebviewViewProvider {
    public static readonly viewType = 'aws.AmazonQChatView'

    webViewContentGenerator: CommonAuthWebViewContentGenerator
    webView: Webview | undefined

    constructor(
        private readonly extensionContext: ExtensionContext,
        private readonly webViewToAppsMessagesPublishers: Map<TabType, MessagePublisher<any>>,
        private readonly appsMessagesListener: MessageListener<any>,
        private readonly onDidChangeVisibility: EventEmitter<boolean>
    ) {
        registerAssetsHttpsFileSystem(extensionContext)
        this.webViewContentGenerator = new CommonAuthWebViewContentGenerator()
    }

    public async resolveWebviewView(
        webviewView: WebviewView,
        context: WebviewViewResolveContext,
        _token: CancellationToken
    ) {
        webviewView.onDidChangeVisibility(() => {
            this.onDidChangeVisibility.fire(webviewView.visible)
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
    }
}
