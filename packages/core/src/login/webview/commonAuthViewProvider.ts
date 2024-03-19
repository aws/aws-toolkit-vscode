/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This is the webview provider of login ux. It should be created per webview.
 * Usage:
 * 1. Create a view in package.json
 * {
        "type": "webview",
        "id": "aws.AmazonCommonAuth",
        "name": "%AWS.amazonq.login%",
        "when": "!isCloud9 && !aws.isSageMaker && !aws.amazonq.showView"
    },

 * 2. Assign when clause context to this view. Manage the state of when clause context.
 * 3. Init this provider at activation
 * const provider2 = new CommonAuthViewProvider(context, appInitContext.onDidChangeAmazonQVisibility)
 *     context.subscriptions.push(
        window.registerWebviewViewProvider(CommonAuthViewProvider.viewType, provider2, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
        }),
 * 
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
import { AmazonQLoginWebview } from './vue/backend_amazonq'
import { ToolkitLoginWebview } from './vue/backend_toolkit'

export class CommonAuthViewProvider implements WebviewViewProvider {
    public static readonly viewType = 'aws.AmazonCommonAuth'

    webView: VueWebviewPanel<ToolkitLoginWebview | AmazonQLoginWebview> | undefined
    source: string = ''

    constructor(
        private readonly extensionContext: ExtensionContext,
        private readonly onDidChangeVisibility: EventEmitter<boolean> | undefined,
        readonly app: string
    ) {
        registerAssetsHttpsFileSystem(extensionContext)
        // Create panel bindings using our class
        const Panel =
            app === 'TOOLKIT'
                ? VueWebview.compilePanel(ToolkitLoginWebview)
                : VueWebview.compilePanel(AmazonQLoginWebview)
        this.source = path.join('vue', 'src', 'login', 'webview', 'vue', 'index.js') // Sent to dist/vue folder in webpack.
        // `context` is `ExtContext` provided on activation
        this.webView = new Panel(extensionContext, this.source)
    }

    public async resolveWebviewView(
        webviewView: WebviewView,
        context: WebviewViewResolveContext,
        _token: CancellationToken
    ) {
        webviewView.onDidChangeVisibility(() => {
            this.onDidChangeVisibility?.fire(webviewView.visible)
        })

        const dist = Uri.joinPath(this.extensionContext.extensionUri, 'dist')
        const resources = Uri.joinPath(this.extensionContext.extensionUri, 'resources')
        webviewView.webview.options = {
            enableScripts: true,
            enableCommandUris: true,
            localResourceRoots: [dist, resources],
        }
        webviewView.webview.html = this._getHtmlForWebview(this.extensionContext.extensionUri, webviewView.webview)
        // register the webview server
        await this.webView?.setup(webviewView.webview)
    }

    private _getHtmlForWebview(extensionURI: Uri, webview: vscode.Webview) {
        const assetsPath = Uri.joinPath(extensionURI)
        const javascriptUri = Uri.joinPath(assetsPath, 'dist', this.source)
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = webview.asWebviewUri(javascriptUri)
        const serverHostname = process.env.WEBPACK_DEVELOPER_SERVER
        const entrypoint =
            serverHostname !== undefined ? Uri.parse(serverHostname).with({ path: `/${this.source}` }) : scriptUri

        return `
			<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">

					<title>Base View Extension</title>
				</head>
				<body>
                     
                    <script src="https://cdn.bootcdn.net/ajax/libs/vue/3.3.4/vue.global.js"></script>
					<script>
						const vscode = acquireVsCodeApi();
                        
					</script>


                    <div id="vue-app"></div>

					<script type="text/javascript" src="${entrypoint.toString()}" defer></script>
				</body>
			</html>`
    }
}
