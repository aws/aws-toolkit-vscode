/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    CancellationToken,
    Uri,
    Webview,
    WebviewView,
    WebviewViewProvider,
    WebviewViewResolveContext,
    window,
} from 'vscode'
import { LanguageClient } from 'vscode-languageclient'
import { globals } from 'aws-core-vscode/shared'
import { handle } from './handler'

export class AmazonQChatViewProvider implements WebviewViewProvider {
    public static readonly viewType = 'aws.AmazonQChatView'

    constructor(private readonly client: LanguageClient) {}

    public async resolveWebviewView(
        webviewView: WebviewView,
        context: WebviewViewResolveContext,
        _token: CancellationToken
    ) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [Uri.joinPath(globals.context.extensionUri, 'resources', 'qdeveloperclient')],
        }

        webviewView.webview.html = this.getWebviewContent(webviewView.webview, globals.context.extensionUri)
        handle(this.client, webviewView.webview)
    }

    private getWebviewContent(webView: Webview, extensionUri: Uri) {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Chat UI</title>
            ${this.generateCss()}
        </head>
        <body>
            ${this.generateJS(webView, extensionUri)}
        </body>
        </html>`
    }

    private generateCss() {
        return `
        <style>
            body,
            html {
                background-color: var(--mynah-color-bg);
                color: var(--mynah-color-text-default);
                height: 100%;
                width: 100%;
                overflow: hidden;
                margin: 0;
                padding: 0;
            }
        </style>`
    }

    private generateJS(webView: Webview, extensionUri: Uri): string {
        const assetsPath = Uri.joinPath(extensionUri)
        const chatUri = Uri.joinPath(assetsPath, 'resources', 'qdeveloperclient', 'amazonq-ui.js')

        const entrypoint = webView.asWebviewUri(chatUri)

        return `
        <script type="text/javascript" src="${entrypoint.toString()}" defer onload="init()"></script>
        <script type="text/javascript">
            const init = () => {
                amazonQChat.createChat(acquireVsCodeApi());
            }
        </script>
        `
    }
}

export function registerChat(client: LanguageClient) {
    const panel = new AmazonQChatViewProvider(client)
    window.registerWebviewViewProvider(AmazonQChatViewProvider.viewType, panel, {
        webviewOptions: {
            retainContextWhenHidden: true,
        },
    })
}
