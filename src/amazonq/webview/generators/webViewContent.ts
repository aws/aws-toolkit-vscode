/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import { Uri, Webview } from 'vscode'
import { featureDevEnabled, gumbyEnabled } from '../../../amazonqFeatureDev/config'
import { getChatAuthState } from '../../../codewhisperer/util/authUtil'

export class WebViewContentGenerator {
    public async generate(extensionURI: Uri, webView: Webview): Promise<string> {
        const entrypoint = process.env.WEBPACK_DEVELOPER_SERVER
            ? 'http: localhost'
            : 'https: file+.vscode-resources.vscode-cdn.net'

        const contentPolicy = `default-src ${entrypoint} data: blob: 'unsafe-inline';
        script-src ${entrypoint} filesystem: ws: wss: 'unsafe-inline';`

        return `<!DOCTYPE html>
        <html>
            <head>
                <meta http-equiv="Content-Security-Policy" content="${contentPolicy}">
                <title>Amazon Q (Preview)</title>                
                ${await this.generateJS(extensionURI, webView)}                
            </head>
            <body>
            </body>
        </html>`
    }

    private async generateJS(extensionURI: Uri, webView: Webview): Promise<string> {
        const source = path.join('src', 'amazonq', 'webview', 'ui', 'amazonq-ui.js')
        const assetsPath = Uri.joinPath(extensionURI)
        const javascriptUri = Uri.joinPath(assetsPath, 'dist', source)

        const serverHostname = process.env.WEBPACK_DEVELOPER_SERVER

        const entrypoint =
            serverHostname !== undefined
                ? Uri.parse(serverHostname).with({ path: `/${source}` })
                : webView.asWebviewUri(javascriptUri)

        return `
        <script type="text/javascript" src="${entrypoint.toString()}" defer onload="init()"></script>
        <script type="text/javascript">
            const init = () => {
                createMynahUI(acquireVsCodeApi(), ${
                    featureDevEnabled && (await getChatAuthState()).amazonQ === 'connected'
                }, ${gumbyEnabled && (await getChatAuthState()).amazonQ === 'connected'});
            }
    </script>
        `
    }
}
