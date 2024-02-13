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

import * as vscode from 'vscode'
import path from 'path'
import {
    WebviewViewProvider,
    ExtensionContext,
    WebviewView,
    WebviewViewResolveContext,
    CancellationToken,
    Uri,
    EventEmitter,
} from 'vscode'
import { registerAssetsHttpsFileSystem } from '../../amazonq/webview/assets/assetsHandler'
import { VueWebview, VueWebviewPanel } from '../../webviews/main'
import { CommonAuthWebview } from './vue/backend'

export class CommonAuthViewProvider implements WebviewViewProvider {
    public static readonly viewType = 'aws.AmazonCommonAuth'

    webView: VueWebviewPanel<CommonAuthWebview> | undefined

    constructor(
        private readonly extensionContext: ExtensionContext,
        private readonly onDidChangeVisibility: EventEmitter<boolean>
    ) {
        registerAssetsHttpsFileSystem(extensionContext)

        // Create panel bindings using our class
        const Panel = VueWebview.compilePanel(CommonAuthWebview)

        // `context` is `ExtContext` provided on activation
        this.webView = new Panel(extensionContext)
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
        webviewView.webview.html = this._getHtmlForWebview(this.extensionContext.extensionUri, webviewView.webview)

        await this.webView?.setup(webviewView.webview)
    }

    private _getHtmlForWebview(extensionURI: Uri, webview: vscode.Webview) {
        const source = path.join('src', 'ac', 'webview', 'vue', 'index.js')
        const assetsPath = Uri.joinPath(extensionURI)
        const javascriptUri = Uri.joinPath(assetsPath, 'dist', source)
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = webview.asWebviewUri(javascriptUri)
        const serverHostname = process.env.WEBPACK_DEVELOPER_SERVER
        const entrypoint =
            serverHostname !== undefined ? Uri.parse(serverHostname).with({ path: `/${source}` }) : scriptUri

        return `
			<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">

					<title>Base View Extension</title>
				</head>
				<body>
                     
					<script>
						const vscode = acquireVsCodeApi();
					</script>

                    <div id="vue-app"></div>

					<script type="text/javascript" src="${entrypoint.toString()}" defer></script>
				</body>
			</html>`
    }
}
