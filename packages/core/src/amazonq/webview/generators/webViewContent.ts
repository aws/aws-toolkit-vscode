/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import { Uri, Webview } from 'vscode'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'
import { FeatureConfigProvider, FeatureContext, globals } from '../../../shared'

export class WebViewContentGenerator {
    private async generateFeatureConfigsData(): Promise<string> {
        let featureConfigs = new Map<string, FeatureContext>()
        try {
            await FeatureConfigProvider.instance.fetchFeatureConfigs()
            featureConfigs = FeatureConfigProvider.getFeatureConfigs()
        } catch (error) {
            // eslint-disable-next-line aws-toolkits/no-console-log
            console.error('Error fetching feature configs:', error)
        }

        // Convert featureConfigs to a string suitable for data-features
        return JSON.stringify(Array.from(featureConfigs.entries()))
    }

    public async generate(extensionURI: Uri, webView: Webview): Promise<string> {
        const entrypoint = process.env.WEBPACK_DEVELOPER_SERVER
            ? 'http: localhost'
            : 'https: file+.vscode-resources.vscode-cdn.net'

        const contentPolicy = `default-src ${entrypoint} data: blob: 'unsafe-inline';
        script-src ${entrypoint} filesystem: ws: wss: 'unsafe-inline';`

        let featureDataAttributes = ''
        try {
            // Fetch and parse featureConfigs
            const featureConfigs = JSON.parse(await this.generateFeatureConfigsData())
            featureDataAttributes = featureConfigs
                .map((config: FeatureContext[]) => `data-feature-${config[1].name}="${config[1].variation}"`)
                .join(' ')
        } catch (error) {
            // eslint-disable-next-line aws-toolkits/no-console-log
            console.error('Error setting data-feature attribute for featureConfigs:', error)
        }
        return `<!DOCTYPE html>
        <html>
            <head>
                <meta http-equiv="Content-Security-Policy" content="${contentPolicy}">
                <title>Amazon Q (Preview)</title>
                ${await this.generateJS(extensionURI, webView)}
            </head>
            <body ${featureDataAttributes}>
            </body>
        </html>`
    }

    private async generateJS(extensionURI: Uri, webView: Webview): Promise<string> {
        const source = path.join('vue', 'src', 'amazonq', 'webview', 'ui', 'amazonq-ui.js') // Sent to dist/vue folder in webpack.
        const assetsPath = Uri.joinPath(extensionURI)
        const javascriptUri = Uri.joinPath(assetsPath, 'dist', source)

        const serverHostname = process.env.WEBPACK_DEVELOPER_SERVER

        const javascriptEntrypoint =
            serverHostname !== undefined
                ? Uri.parse(serverHostname).with({ path: `/${source}` })
                : webView.asWebviewUri(javascriptUri)

        const cssEntrypoints = [
            Uri.joinPath(globals.context.extensionUri, 'resources', 'css', 'amazonq-webview.css'),
            Uri.joinPath(globals.context.extensionUri, 'resources', 'css', 'amazonq-chat.css'),
        ]

        const cssEntrypointsMap = cssEntrypoints.map((item) => webView.asWebviewUri(item))
        const cssLinks = cssEntrypointsMap.map((uri) => `<link rel="stylesheet" href="${uri.toString()}">`).join('\n')

        // Fetch featureConfigs and use it within the script
        const featureConfigsString = await this.generateFeatureConfigsData()

        return `
        <script type="text/javascript" src="${javascriptEntrypoint.toString()}" defer onload="init()"></script>
        ${cssLinks}
        <script type="text/javascript">
            const init = () => {
                createMynahUI(acquireVsCodeApi(), ${
                    (await AuthUtil.instance.getChatAuthState()).amazonQ === 'connected'
                },${featureConfigsString});
            }
        </script>
        `
    }
}
