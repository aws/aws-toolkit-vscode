/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    EventEmitter,
    CancellationToken,
    WebviewView,
    WebviewViewProvider,
    WebviewViewResolveContext,
    Uri,
    Webview,
} from 'vscode'
import * as path from 'path'
import {
    globals,
    isSageMaker,
    AmazonQPromptSettings,
    LanguageServerResolver,
    amazonqMark,
    getLogger,
} from 'aws-core-vscode/shared'
import { AuthUtil, RegionProfile } from 'aws-core-vscode/codewhisperer'
import { featureConfig } from 'aws-core-vscode/amazonq'
import { getAmazonQLspConfig } from '../config'

export class AmazonQChatViewProvider implements WebviewViewProvider {
    public static readonly viewType = 'aws.amazonq.AmazonQChatView'
    private readonly onDidResolveWebviewEmitter = new EventEmitter<void>()
    public readonly onDidResolveWebview = this.onDidResolveWebviewEmitter.event

    webviewView?: WebviewView
    webview?: Webview

    connectorAdapterPath?: string
    uiPath?: string

    constructor(private readonly mynahUIPath: string) {}

    public async resolveWebviewView(
        webviewView: WebviewView,
        context: WebviewViewResolveContext,
        _token: CancellationToken
    ) {
        const lspDir = Uri.file(LanguageServerResolver.defaultDir())
        const dist = Uri.joinPath(globals.context.extensionUri, 'dist')
        const bundledResources = Uri.joinPath(globals.context.extensionUri, 'resources/language-server')
        let resourcesRoots = [lspDir, dist]
        if (this.mynahUIPath?.startsWith(globals.context.extensionUri.fsPath)) {
            getLogger('amazonqLsp').info(`Using bundled webview resources ${bundledResources.fsPath}`)
            resourcesRoots = [bundledResources, dist]
        }
        /**
         * if the mynah chat client is defined, then make sure to add it to the resource roots, otherwise
         * it will 401 when trying to load
         */
        const mynahUIPath = getAmazonQLspConfig().ui
        if (mynahUIPath) {
            const dir = path.dirname(mynahUIPath)
            resourcesRoots.push(Uri.file(dir))
        }

        webviewView.webview.options = {
            enableScripts: true,
            enableCommandUris: true,
            localResourceRoots: resourcesRoots,
        }

        const source = 'vue/src/amazonq/webview/ui/amazonq-ui-connector-adapter.js' // Sent to dist/vue folder in webpack.
        const serverHostname = process.env.WEBPACK_DEVELOPER_SERVER

        this.connectorAdapterPath =
            serverHostname !== undefined
                ? `${serverHostname}/${source}`
                : webviewView.webview.asWebviewUri(Uri.joinPath(dist, source)).toString()
        this.uiPath = webviewView.webview.asWebviewUri(Uri.file(this.mynahUIPath)).toString()

        webviewView.webview.html = await this.getWebviewContent()

        this.webviewView = webviewView
        this.webview = this.webviewView.webview

        this.onDidResolveWebviewEmitter.fire()
        performance.mark(amazonqMark.open)
    }

    private async getWebviewContent() {
        const featureConfigData = await featureConfig.getFeatureConfigs()

        const isSM = isSageMaker('SMAI')
        const isSMUS = isSageMaker('SMUS')
        const disabledCommands = isSM ? `['/dev', '/transform', '/test', '/review', '/doc']` : '[]'
        const disclaimerAcknowledged = !AmazonQPromptSettings.instance.isPromptEnabled('amazonQChatDisclaimer')
        const pairProgrammingAcknowledged =
            !AmazonQPromptSettings.instance.isPromptEnabled('amazonQChatPairProgramming')
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
            ? 'http://localhost:8080'
            : 'https://file+.vscode-resource.vscode-cdn.net'

        const contentPolicy = `default-src ${entrypoint} data: blob: 'unsafe-inline';
            script-src ${entrypoint} filesystem: file: vscode-resource: https: ws: wss: 'unsafe-inline';`

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
            <script type="text/javascript" src="${this.uiPath?.toString()}" defer onload="init()"></script>
            <script type="text/javascript" src="${this.connectorAdapterPath?.toString()}"></script>
            <script type="text/javascript">
                let qChat = undefined
                const init = () => {
                    const vscodeApi = acquireVsCodeApi()
                    const hybridChatConnector = new HybridChatAdapter(${(await AuthUtil.instance.getChatAuthState()).amazonQ === 'connected'},${featureConfigData},${welcomeCount},${disclaimerAcknowledged},${regionProfileString},${disabledCommands},${isSMUS},${isSM},vscodeApi.postMessage)
                    const commands = [hybridChatConnector.initialQuickActions[0]]
                    qChat = amazonQChat.createChat(vscodeApi, {disclaimerAcknowledged: ${disclaimerAcknowledged}, pairProgrammingAcknowledged: ${pairProgrammingAcknowledged}, agenticMode: true, quickActionCommands: commands}, hybridChatConnector, ${JSON.stringify(featureConfigData)});
                }
                window.addEventListener('message', (event) => {
                    /**
                     * special handler that "simulates" reloading the webview when a profile changes.
                     * required because chat-client relies on initializedResult from the lsp that
                     * are only sent once
                     * 
                     * References:
                     *   closing tabs: https://github.com/aws/mynah-ui/blob/de736b52f369ba885cd19f33ac86c6f57b4a3134/docs/USAGE.md#removing-a-tab-programmatically-
                     *   opening tabs: https://github.com/aws/aws-toolkit-vscode/blob/c22efa03e73b241564c8051c35761eb8620edb83/packages/amazonq/test/e2e/amazonq/framework/framework.ts#L98
                     */
                    if (event.data.command === 'reload' && qChat) {
                        // close all previous tabs
                        Object.keys(qChat.getAllTabs()).forEach(tabId => qChat.removeTab(tabId, qChat.lastEventId));

                        // open a new "initial" tab
                        ;(document.querySelectorAll('.mynah-nav-tabs-wrapper > button.mynah-button')[0]).click()
                    }
                });
            </script>
        </body>
        </html>`
    }

    async refreshWebview() {
        if (this.webview) {
            // post a message to the webview telling it to reload
            void this.webview?.postMessage({
                command: 'reload',
            })
        }
    }
}
