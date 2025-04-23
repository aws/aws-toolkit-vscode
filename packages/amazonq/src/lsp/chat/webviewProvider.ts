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
        const lspDir = Uri.parse(LanguageServerResolver.defaultDir())
        const dist = Uri.joinPath(globals.context.extensionUri, 'dist')

        const resourcesRoots = [lspDir, dist]

        /**
         * if the mynah chat client is defined, then make sure to add it to the resource roots, otherwise
         * it will 401 when trying to load
         */
        const mynahUIPath = getAmazonQLspConfig().ui
        if (process.env.WEBPACK_DEVELOPER_SERVER && mynahUIPath) {
            const dir = path.dirname(mynahUIPath)
            resourcesRoots.push(Uri.parse(dir))
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
                ? Uri.parse(serverHostname)
                      .with({ path: `/${source}` })
                      .toString()
                : webviewView.webview.asWebviewUri(Uri.parse(path.join(dist.fsPath, source))).toString()
        this.uiPath = webviewView.webview.asWebviewUri(Uri.parse(this.mynahUIPath)).toString()

        webviewView.webview.html = await this.getWebviewContent()

        this.webviewView = webviewView
        this.webview = this.webviewView.webview

        this.onDidResolveWebviewEmitter.fire()
        globals.context.subscriptions.push(
            this.webviewView.onDidDispose(() => {
                this.webviewView = undefined
                this.webview = undefined
            })
        )
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
            ? 'http: localhost'
            : 'https: file+.vscode-resources.vscode-cdn.net'

        const contentPolicy = `default-src ${entrypoint} data: blob: 'unsafe-inline';
            script-src ${entrypoint} filesystem: ws: wss: 'unsafe-inline';`

        // TODO move these styles to a dedicated css file.
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

                    --mynah-font-family: var(--vscode-font-family), system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI',
                        'Amazon Ember', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                    font-size: var(--vscode-font-size, 12px);
                    font-family: var(--mynah-font-family, 'system-ui');
                    --mynah-max-width: 2560px;
                    --mynah-sizing-base: 0.2rem;
                    --mynah-sizing-half: calc(var(--mynah-sizing-base) / 2);
                    --mynah-sizing-1: var(--mynah-sizing-base);
                    --mynah-sizing-2: calc(var(--mynah-sizing-base) * 2);
                    --mynah-sizing-3: calc(var(--mynah-sizing-base) * 3);
                    --mynah-sizing-4: calc(var(--mynah-sizing-base) * 4);
                    --mynah-sizing-5: calc(var(--mynah-sizing-base) * 5);
                    --mynah-sizing-6: calc(var(--mynah-sizing-base) * 6);
                    --mynah-sizing-7: calc(var(--mynah-sizing-base) * 7);
                    --mynah-sizing-8: calc(var(--mynah-sizing-base) * 8);
                    --mynah-sizing-9: calc(var(--mynah-sizing-base) * 9);
                    --mynah-sizing-10: calc(var(--mynah-sizing-base) * 10);
                    --mynah-sizing-11: calc(var(--mynah-sizing-base) * 11);
                    --mynah-sizing-12: calc(var(--mynah-sizing-base) * 12);
                    --mynah-sizing-13: calc(var(--mynah-sizing-base) * 13);
                    --mynah-sizing-14: calc(var(--mynah-sizing-base) * 14);
                    --mynah-sizing-15: calc(var(--mynah-sizing-base) * 15);
                    --mynah-sizing-16: calc(var(--mynah-sizing-base) * 16);
                    --mynah-sizing-17: calc(var(--mynah-sizing-base) * 17);
                    --mynah-sizing-18: calc(var(--mynah-sizing-base) * 18);
                    --mynah-chat-wrapper-spacing: var(--mynah-sizing-2);
                    --mynah-button-border-width: 1px;
                    --mynah-border-width: 1px;

                    --mynah-color-text-default: var(--vscode-foreground);
                    --mynah-color-text-strong: var(--vscode-input-foreground);
                    --mynah-color-text-weak: var(--vscode-disabledForeground);
                    --mynah-color-text-link: var(--vscode-textLink-foreground);
                    --mynah-color-text-input: var(--vscode-input-foreground);

                    --mynah-color-bg: var(--vscode-sideBar-background);
                    --mynah-color-tab-active: var(--vscode-tab-activeBackground, var(--vscode-editor-background, var(--mynah-card-bg)));
                    --mynah-color-light: rgba(0, 0, 0, 0.05);

                    --mynah-color-border-default: var(--vscode-panel-border, var(--vscode-tab-border, rgba(0, 0, 0, 0.1)));

                    --mynah-color-highlight: rgba(255, 179, 0, 0.25);
                    --mynah-color-highlight-text: #886411;

                    --mynah-color-toggle: var(--vscode-sideBar-background);
                    --mynah-color-toggle-reverse: rgba(0, 0, 0, 0.5);

                    --mynah-color-syntax-bg: var(--vscode-terminal-dropBackground);
                    --mynah-color-syntax-variable: var(--vscode-debugTokenExpression-name);
                    --mynah-color-syntax-function: var(--vscode-gitDecoration-modifiedResourceForeground);
                    --mynah-color-syntax-operator: var(--vscode-debugTokenExpression-name);
                    --mynah-color-syntax-attr-value: var(--vscode-debugIcon-stepBackForeground);
                    --mynah-color-syntax-attr: var(--vscode-debugTokenExpression-string);
                    --mynah-color-syntax-property: var(--vscode-terminal-ansiCyan);
                    --mynah-color-syntax-comment: var(--vscode-debugConsole-sourceForeground);
                    --mynah-color-syntax-code: var(--vscode-terminal-ansiBlue);
                    --mynah-syntax-code-font-family: var(--vscode-editor-font-family);
                    --mynah-syntax-code-font-size: var(--vscode-editor-font-size, var(--mynah-font-size-medium));
                    --mynah-syntax-code-block-max-height: calc(25 * var(--mynah-syntax-code-line-height));

                    --mynah-color-status-info: var(--vscode-editorInfo-foreground);
                    --mynah-color-status-success: var(--vscode-terminal-ansiGreen);
                    --mynah-color-status-warning: var(--vscode-editorWarning-foreground);
                    --mynah-color-status-error: var(--vscode-editorError-foreground);

                    --mynah-color-button: var(--vscode-button-background);
                    --mynah-color-button-reverse: var(--vscode-button-foreground);

                    --mynah-color-alternate: var(--vscode-button-secondaryBackground);
                    --mynah-color-alternate-reverse: var(--vscode-button-secondaryForeground);

                    --mynah-card-bg: var(--vscode-editor-background);

                    --mynah-shadow-button: none;
                    --mynah-shadow-card: none;
                    --mynah-shadow-overlay: 0 0px 15px -5px rgba(0, 0, 0, 0.4);

                    --mynah-font-size-xxsmall: 0.75rem;
                    --mynah-font-size-xsmall: 0.85rem;
                    --mynah-font-size-small: 0.95rem;
                    --mynah-font-size-medium: 1rem;
                    --mynah-font-size-large: 1.125rem;
                    --mynah-line-height: 1.1rem;
                    --mynah-syntax-code-line-height: 1.1rem;

                    --mynah-card-radius: var(--mynah-sizing-2);
                    --mynah-input-radius: var(--mynah-sizing-1);
                    --mynah-card-radius-corner: 0;
                    --mynah-button-radius: var(--mynah-sizing-1);

                    --mynah-bottom-panel-transition: all 850ms cubic-bezier(0.25, 1, 0, 1);
                    --mynah-very-short-transition: all 600ms cubic-bezier(0.25, 1, 0, 1);
                    --mynah-very-long-transition: all 1650ms cubic-bezier(0.25, 1, 0, 1);
                    --mynah-short-transition: all 550ms cubic-bezier(0.85, 0.15, 0, 1);
                    --mynah-short-transition-rev: all 580ms cubic-bezier(0.35, 1, 0, 1);
                    --mynah-short-transition-rev-opacity: opacity 750ms cubic-bezier(0.35, 1, 0, 1);
                    --mynah-text-flow-transition: all 800ms cubic-bezier(0.35, 1.2, 0, 1), transform 800ms cubic-bezier(0.2, 1.05, 0, 1);
                }

                body.vscode-dark,
                body.vscode-high-contrast:not(.vscode-high-contrast-light) {
                    --mynah-color-light: rgba(255, 255, 255, 0.05);
                    --mynah-color-highlight: rgba(0, 137, 255, 0.2);
                    --mynah-color-highlight-text: rgba(0, 137, 255, 1);
                }

                body .mynah-card-body h1 {
                    --mynah-line-height: 1.5rem;
                    font-size: 1.25em;
                }

                body .mynah-card-body h2,
                body .mynah-card-body h3,
                body .mynah-card-body h4 {
                    font-size: 1em;
                }

                div.mynah-card.padding-large {
                    padding: var(--mynah-sizing-4) var(--mynah-sizing-3);
                }

                .mynah-chat-wrapper {
                    padding: 0.75rem 1.25rem;
                    box-sizing: border-box;
                }
                .mynah-syntax-highlighter>pre>code, .mynah-syntax-highlighter>pre {
                    overflow: hidden !important;
                    text-wrap: wrap !important;
                }  
            </style>
        </head>
        <body>
            <script type="text/javascript" src="${this.uiPath?.toString()}" defer onload="init()"></script>
            <script type="text/javascript" src="${this.connectorAdapterPath?.toString()}"></script>
            <script type="text/javascript">
                const init = () => {
                    const vscodeApi = acquireVsCodeApi()
                    const hybridChatConnector = new HybridChatAdapter(${(await AuthUtil.instance.getChatAuthState()).amazonQ === 'connected'},${featureConfigData},${welcomeCount},${disclaimerAcknowledged},${regionProfileString},${disabledCommands},${isSMUS},${isSM},vscodeApi.postMessage)
                    const commands = [hybridChatConnector.initialQuickActions[0]]
                    amazonQChat.createChat(vscodeApi, {disclaimerAcknowledged: ${disclaimerAcknowledged}, pairProgrammingAcknowledged: ${pairProgrammingAcknowledged}, quickActionCommands: commands}, hybridChatConnector);
                }
            </script>
        </body>
        </html>`
    }

    async refreshWebview() {
        if (this.webview) {
            // refresh the webview when the profile changes
            this.webview.html = await this.getWebviewContent()
        }
    }
}
