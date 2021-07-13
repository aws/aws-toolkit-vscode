/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import { debounce } from 'lodash'
import * as vscode from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { getLogger, Logger } from '../../shared/logger'
import { AbstractAslVisualization } from '../../../src/stepFunctions/commands/visualizeStateMachine/abstractAslVisualization'


export interface MessageObject {
    command: string
    text: string
    error?: string
    stateMachineData: string
}

export class AslVisualizationCDK extends AbstractAslVisualization {
    public readonly cfnDefinition: string
    public readonly uniqueIdentifier: string

    public constructor(cfnDefinition: string, uniqueIdentifier: string) {
        super(uniqueIdentifier)
        this.cfnDefinition = cfnDefinition
        this.uniqueIdentifier = uniqueIdentifier
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
            //can I just put this true or should I make an isValid fntn?
            isValid: true,
            errors: [],
        })
    }

    protected override setupWebviewPanel(uniqueIdentifier: string): vscode.WebviewPanel {
        const logger: Logger = getLogger()

        // Create and show panel
        const panel = this.createVisualizationWebviewPanel(uniqueIdentifier)

        // Set the initial html for the webpage
        panel.webview.html = this.getWebviewContent(
            panel.webview.asWebviewUri(ext.visualizationResourcePaths.webviewBodyScript),
            panel.webview.asWebviewUri(ext.visualizationResourcePaths.visualizationLibraryScript),
            panel.webview.asWebviewUri(ext.visualizationResourcePaths.visualizationLibraryCSS),
            panel.webview.asWebviewUri(ext.visualizationResourcePaths.stateMachineCustomThemeCSS),
            panel.webview.cspSource,
            {
                inSync: localize(
                    'AWS.stepFunctions.graph.status.inSync',
                    'Previewing ASL state machine'
                ),
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

    protected override makeWebviewTitle(uniqueIdentifier: string): string {
        return localize('AWS.stepFunctions.graph.titlePrefix', 'Graph: {0}', uniqueIdentifier)
    }
}