/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import { Uri, Webview } from 'vscode'
import { gumbyEnabled, featureDevEnabled } from '../../../amazonqFeatureDev/config'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'

export class WebViewContentGenerator {
    public generate(extensionURI: Uri, webView: Webview): string {
        const entrypoint = process.env.WEBPACK_DEVELOPER_SERVER
            ? 'http: localhost'
            : 'https: *.vscode-resources.vscode-cdn.net'

        const contentPolicy = `default-src ${entrypoint} data: blob: 'unsafe-inline';
        script-src ${entrypoint} filesystem: ws: wss: 'unsafe-inline';`

        return `<!DOCTYPE html>
        <html>
            <head>
                <meta http-equiv="Content-Security-Policy" content="${contentPolicy}">
                <title>Amazon Q (Preview)</title>                
                ${this.generateJS(extensionURI, webView)}                
            </head>
            <body>
            </body>
        </html>`
    }

    private generateJS(extensionURI: Uri, webView: Webview): string {
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
                    featureDevEnabled && AuthUtil.instance.isEnterpriseSsoInUse()
                }, ${gumbyEnabled});
            }
    </script>
        `
    }
}
