/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    EventEmitter,
    CancellationToken,
    Webview,
    WebviewView,
    WebviewViewProvider,
    WebviewViewResolveContext,
    Uri,
} from 'vscode'
import * as path from 'path'
import {
    globals,
    isSageMaker,
    AmazonQPromptSettings,
    LanguageServerResolver,
    amazonqMark,
} from 'aws-core-vscode/shared'
import { AuthUtil, RegionProfile } from 'aws-core-vscode/codewhisperer'
import { featureConfig } from 'aws-core-vscode/amazonq'

export class AmazonQChatViewProvider implements WebviewViewProvider {
    public static readonly viewType = 'aws.amazonq.AmazonQChatView'
    private readonly onDidResolveWebviewEmitter = new EventEmitter<void>()
    public readonly onDidResolveWebview = this.onDidResolveWebviewEmitter.event

    webview: Webview | undefined

    constructor(private readonly mynahUIPath: string) {}

    public async resolveWebviewView(
        webviewView: WebviewView,
        context: WebviewViewResolveContext,
        _token: CancellationToken
    ) {
        this.webview = webviewView.webview

        const lspDir = Uri.parse(LanguageServerResolver.defaultDir)
        const dist = Uri.joinPath(globals.context.extensionUri, 'dist')
        webviewView.webview.options = {
            enableScripts: true,
            enableCommandUris: true,
            localResourceRoots: [lspDir, dist],
        }

        const source = 'vue/src/amazonq/webview/ui/amazonq-ui-connector-adapter.js' // Sent to dist/vue folder in webpack.
        const serverHostname = process.env.WEBPACK_DEVELOPER_SERVER
        const connectorAdapterPath =
            serverHostname !== undefined
                ? Uri.parse(serverHostname)
                      .with({ path: `/${source}` })
                      .toString()
                : webviewView.webview.asWebviewUri(Uri.parse(path.join(dist.fsPath, source))).toString()
        const uiPath = webviewView.webview.asWebviewUri(Uri.parse(this.mynahUIPath)).toString()
        webviewView.webview.html = await this.getWebviewContent(uiPath, connectorAdapterPath)

        this.onDidResolveWebviewEmitter.fire()
        performance.mark(amazonqMark.open)
    }

    private async getWebviewContent(mynahUIPath: string, hybridChatConnector: string) {
        const featureConfigData = await featureConfig.getFeatureConfigs()

        const isSM = isSageMaker('SMAI')
        const isSMUS = isSageMaker('SMUS')
        const disabledCommands = isSM ? `['/dev', '/transform', '/test', '/review', '/doc']` : '[]'
        const disclaimerAcknowledged = AmazonQPromptSettings.instance.isPromptEnabled('amazonQChatDisclaimer')
        const welcomeCount = globals.globalState.tryGet('aws.amazonq.welcomeChatShowCount', Number, 0)

        // only show profile card when the two conditions
        //  1. profile count >= 2
        //  2. not default (fallback) which has empty arn
        let regionProfile: RegionProfile | undefined = AuthUtil.instance.regionProfileManager.activeRegionProfile
        if (AuthUtil.instance.regionProfileManager.profiles.length === 1) {
            regionProfile = undefined
        }

        const regionProfileString: string = JSON.stringify(regionProfile)

        const entrypoint = process.env.WEBPACK_DEVELOPER_SERVER
            ? 'http: localhost'
            : 'https: file+.vscode-resources.vscode-cdn.net'

        const contentPolicy = `default-src ${entrypoint} data: blob: 'unsafe-inline';
            script-src ${entrypoint} filesystem: ws: wss: 'unsafe-inline';`

        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="${contentPolicy}">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Chat</title>
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
            </style>
        </head>
        <body>
            <script type="text/javascript" src="${mynahUIPath.toString()}" defer onload="init()"></script>
            <script type="text/javascript" src="${hybridChatConnector.toString()}"></script>
            <script type="text/javascript">
                const init = () => {
                    const vscodeApi = acquireVsCodeApi()
                    const hybridChatConnector = new HybridChatAdapter(${(await AuthUtil.instance.getChatAuthState()).amazonQ === 'connected'},${featureConfigData},${welcomeCount},${disclaimerAcknowledged},${regionProfileString},${disabledCommands},${isSMUS},${isSM},vscodeApi.postMessage)
                    const commands = [hybridChatConnector.initialQuickActions[0], {
                        groupName: 'Quick Actions',
                        commands: [
                            {
                                command: '/help',
                                icon: 'help',
                                description: 'Learn more about Amazon Q',
                            },
                            {
                                command: '/clear',
                                icon: 'trash',
                                description: 'Clear this session',
                            },
                        ],
                    }]
                    amazonQChat.createChat(vscodeApi, {disclaimerAcknowledged: ${disclaimerAcknowledged}, quickActionCommands: commands}, hybridChatConnector);
                }
            </script>
        </body>
        </html>`
    }
}
