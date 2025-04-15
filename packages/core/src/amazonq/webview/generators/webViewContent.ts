/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import { Uri, Webview } from 'vscode'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'
import globals from '../../../shared/extensionGlobals'
import { isSageMaker } from '../../../shared/extensionUtilities'
import { RegionProfile } from '../../../codewhisperer/models/model'
import { AmazonQPromptSettings } from '../../../shared/settings'
import { getFeatureConfigs, serialize } from './featureConfig'

export class WebViewContentGenerator {
    public async generate(extensionURI: Uri, webView: Webview): Promise<string> {
        const entrypoint = process.env.WEBPACK_DEVELOPER_SERVER
            ? 'http: localhost'
            : 'https: file+.vscode-resources.vscode-cdn.net'

        const contentPolicy = `default-src ${entrypoint} data: blob: 'unsafe-inline';
        script-src ${entrypoint} filesystem: ws: wss: 'unsafe-inline';`

        const configs = await getFeatureConfigs()
        const featureDataAttributes = serialize(configs)
        return `<!DOCTYPE html>
        <html>
            <head>
                <meta http-equiv="Content-Security-Policy" content="${contentPolicy}">
                <title>Amazon Q (Preview)</title>
                ${await this.generateJS(extensionURI, webView, configs)}
            </head>
            <body ${featureDataAttributes}>
            </body>
        </html>`
    }

    private async generateJS(extensionURI: Uri, webView: Webview, featureConfigsString: string): Promise<string> {
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

        const isSM = isSageMaker('SMAI')
        const isSMUS = isSageMaker('SMUS')

        const disabledCommandsString = isSM ? `['/dev', '/transform', '/test', '/review', '/doc']` : '[]'
        const disclaimerAcknowledged = !AmazonQPromptSettings.instance.isPromptEnabled('amazonQChatDisclaimer')
        const welcomeLoadCount = globals.globalState.tryGet('aws.amazonq.welcomeChatShowCount', Number, 0)

        // only show profile card when the two conditions
        //  1. profile count >= 2
        //  2. not default (fallback) which has empty arn
        let regionProfile: RegionProfile | undefined = AuthUtil.instance.regionProfileManager.activeRegionProfile
        if (AuthUtil.instance.regionProfileManager.profiles.length === 1) {
            regionProfile = undefined
        }

        const regionProfileString: string = JSON.stringify(regionProfile)
        const authState = (await AuthUtil.instance.getChatAuthState()).amazonQ

        return `
        <script type="text/javascript" src="${javascriptEntrypoint.toString()}" defer onload="init()"></script>
        ${cssLinks}
        <script type="text/javascript">
            const init = () => {
                createMynahUI(
                    acquireVsCodeApi(), 
                    ${authState === 'connected'},
                    ${featureConfigsString},
                    ${welcomeLoadCount},
                    ${disclaimerAcknowledged},
                    ${regionProfileString},
                    ${disabledCommandsString},
                    ${isSMUS},
                    ${isSM}
                );
            }
        </script>
        `
    }
}
