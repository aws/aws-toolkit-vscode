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
import { AmazonQLoginWebview } from './vue/amazonq/backend_amazonq'
import { ToolkitLoginWebview } from './vue/toolkit/backend_toolkit'
import { CodeCatalystAuthenticationProvider } from '../../codecatalyst/auth'

export class CommonAuthViewProvider implements WebviewViewProvider {
    public readonly viewType: string

    webView: VueWebviewPanel<ToolkitLoginWebview | AmazonQLoginWebview> | undefined
    source: string = ''

    constructor(
        private readonly extensionContext: ExtensionContext,
        readonly app: string,
        private readonly onDidChangeVisibility?: EventEmitter<boolean>
    ) {
        this.viewType = `aws.${app}.AmazonCommonAuth`

        registerAssetsHttpsFileSystem(extensionContext)
        if (app === 'toolkit') {
            // Create panel bindings using our class
            const Panel = VueWebview.compilePanel(ToolkitLoginWebview)
            // `context` is `ExtContext` provided on activation
            this.webView = new Panel(extensionContext, CodeCatalystAuthenticationProvider.fromContext(extensionContext))
            this.source = ToolkitLoginWebview.sourcePath
        } else if (app === 'amazonq') {
            const Panel = VueWebview.compilePanel(AmazonQLoginWebview)
            this.webView = new Panel(extensionContext)
            this.source = AmazonQLoginWebview.sourcePath
        } else {
            throw new Error(`invalid app provided to common auth view: ${app}`)
        }
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
                    <script src="https://cdnjs.cloudflare.com/ajax/libs/vue/3.4.4/vue.global.prod.min.js"></script>  
                    <script>
                        const vscode = acquireVsCodeApi();
                    </script>

                    <div id="vue-app"></div>

                    <script type="text/javascript" src="${entrypoint.toString()}" defer></script>
                </body>
            </html>`
    }
}
