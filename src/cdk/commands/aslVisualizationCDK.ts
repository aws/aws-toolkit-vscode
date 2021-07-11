/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import { debounce } from 'lodash'
//import * as path from 'path'
import * as vscode from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { getLogger, Logger } from '../../shared/logger'


export interface MessageObject {
    command: string
    text: string
    error?: string
    stateMachineData: string
}

export class AslVisualizationCDK {
    public readonly cfnDefinition: string
    public readonly uniqueIdentifier: string
    public readonly webviewPanel: vscode.WebviewPanel
    protected readonly disposables: vscode.Disposable[] = []
    protected isPanelDisposed = false
    private readonly onVisualizationDisposeEmitter = new vscode.EventEmitter<void>()

    public constructor(cfnDefinition: string, uniqueIdentifier: string) {
        this.cfnDefinition = cfnDefinition
        this.uniqueIdentifier = uniqueIdentifier
        this.webviewPanel = this.setupWebviewPanel()
    }

    public get onVisualizationDisposeEvent(): vscode.Event<void> {
        return this.onVisualizationDisposeEmitter.event
    }

    public getPanel(): vscode.WebviewPanel | undefined {
        if (!this.isPanelDisposed) {
            return this.webviewPanel
        }
    }

    public getWebview(): vscode.Webview | undefined {
        if (!this.isPanelDisposed) {
            return this.webviewPanel?.webview
        }
    }

    public showPanel(): void {
        this.getPanel()?.reveal()
    }

    public async sendUpdateMessage(stateMachineData: string) {
        const logger: Logger = getLogger()

        const webview = this.getWebview()
        if (this.isPanelDisposed || !webview) {
            return
        }

        logger.debug('Sending update message to webview.')

        webview.postMessage({
            command: 'update',
            stateMachineData,
            //might need to make an isValid fntn
            isValid: true,
            errors: [],
        })
    }

    private setupWebviewPanel(): vscode.WebviewPanel {
        const logger: Logger = getLogger()

        // Create and show panel
        const panel = this.createVisualizationWebviewPanel()

        // Set the initial html for the webpage
        panel.webview.html = this.getWebviewContent(
            panel.webview.asWebviewUri(ext.visualizationResourcePaths.webviewBodyScript),
            panel.webview.asWebviewUri(ext.visualizationResourcePaths.visualizationLibraryScript),
            panel.webview.asWebviewUri(ext.visualizationResourcePaths.visualizationLibraryCSS),
            panel.webview.asWebviewUri(ext.visualizationResourcePaths.stateMachineCustomThemeCSS),
            panel.webview.cspSource,
            {
                notInSync: localize('AWS.stepFunctions.graph.status.notInSync', 'Errors detected. Cannot preview.'),
                syncing: localize('AWS.stepFunctions.graph.status.syncing', 'Rendering ASL graph...'),
            }
        )

        const debouncedUpdate = debounce(this.sendUpdateMessage.bind(this), 500)

        // Handle messages from the webview
        this.disposables.push(
            panel.webview.onDidReceiveMessage(async (message: MessageObject) => {
                switch (message.command) {
                    case 'updateResult':
                        logger.debug(message.text)
                        if (message.error) {
                            logger.error(message.error)
                        }
                        break
                    case 'webviewRendered': {
                        // Webview has finished rendering, so now we can give it our
                        // initial state machine definition.
                        await this.sendUpdateMessage(this.cfnDefinition)
                        break
                    }
                }
            })
        )

        // When the panel is closed, dispose of any disposables/remove subscriptions
        const disposePanel = () => {
            if (this.isPanelDisposed) {
                return
            }
            this.isPanelDisposed = true
            debouncedUpdate.cancel()
            this.onVisualizationDisposeEmitter.fire()
            this.disposables.forEach(disposable => {
                disposable.dispose()
            })
            this.onVisualizationDisposeEmitter.dispose()
        }

        this.disposables.push(
            panel.onDidDispose(() => {
                disposePanel()
            })
        )

        return panel
    }

    private createVisualizationWebviewPanel(): vscode.WebviewPanel {
        return vscode.window.createWebviewPanel(
            'stateMachineVisualization',
            this.makeWebviewTitle(this.uniqueIdentifier),
            {
                preserveFocus: true,
                viewColumn: vscode.ViewColumn.Beside,
            },
            {
                enableScripts: true,
                localResourceRoots: [
                    ext.visualizationResourcePaths.localWebviewScriptsPath,
                    ext.visualizationResourcePaths.visualizationLibraryCachePath,
                    ext.visualizationResourcePaths.stateMachineCustomThemePath,
                ],
                retainContextWhenHidden: true,
            }
        )
    }

    private makeWebviewTitle(uniqueIdentifier: string): string {
        return localize('AWS.stepFunctions.graph.titlePrefix', 'Graph: {0}', uniqueIdentifier)
    }

    private getWebviewContent(
        webviewBodyScript: vscode.Uri,
        graphStateMachineLibrary: vscode.Uri,
        vsCodeCustomStyling: vscode.Uri,
        graphStateMachineDefaultStyles: vscode.Uri,
        cspSource: string,
        statusTexts: {
            syncing: string
            notInSync: string
        }
    ): string {
        return `
    <!DOCTYPE html>
    <html>
        <head>
            <meta http-equiv="Content-Security-Policy"
            content="default-src 'none';
            img-src ${cspSource} https: data:;
            script-src ${cspSource} 'self' 'unsafe-eval';
            style-src ${cspSource};"
            >
            <meta charset="UTF-8">
            <link rel="stylesheet" href='${graphStateMachineDefaultStyles}'>
            <link rel="stylesheet" href='${vsCodeCustomStyling}'>
            <script src='${graphStateMachineLibrary}'></script>
        </head>

        <body>
            <div id="svgcontainer" class="workflowgraph">
                <svg></svg>
            </div>
            <div id = "forCDK" class="status-info">
                <div class="status-messages">
                    <span class="rendering-asl-message">${statusTexts.syncing}</span>
                    <span class="error-asl-message">${statusTexts.notInSync}</span>
                </div>
            </div>
            <div class="graph-buttons-container">
                <button id="zoomin">
                    <svg focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
                        <line x1="8" y1="1" x2="8" y2="15"></line>
                        <line x1="15" y1="8" x2="1" y2="8"></line>
                    </svg>
                </button>
                <button id="zoomout">
                    <svg focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
                        <line x1="15" y1="8" x2="1" y2="8"></line>
                    </svg>
                </button>
                <button id="center">
                    <svg focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
                        <circle cx="8" cy="8" r="7" stroke-width="2" />
                        <circle cx="8" cy="8" r="1" stroke-width="2" />
                    </svg>
                </button>
            </div>

            <script src='${webviewBodyScript}'></script>
        </body>
    </html>`
    }
}