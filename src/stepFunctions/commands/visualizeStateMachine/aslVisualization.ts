/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import { debounce } from 'lodash'
import * as path from 'path'
import * as vscode from 'vscode'
import { ext } from '../../../shared/extensionGlobals'
import { getLogger, Logger } from '../../../shared/logger'
import { isDocumentValid } from '../../utils'
import * as yaml from 'yaml'

import { YAML_ASL } from '../../constants/aslFormats'
import { AbstractAslVisualization } from './abstractAslVisualization'

const YAML_OPTIONS: yaml.Options = {
    merge: false,
    maxAliasCount: 0,
    schema: 'yaml-1.1',
    version: '1.1',
    prettyErrors: true,
}

export interface MessageObject {
    command: string
    text: string
    error?: string
    stateMachineData: string
}

export class AslVisualization extends AbstractAslVisualization {
    public readonly documentUri: vscode.Uri

    public constructor(textDocument: vscode.TextDocument) {
        super(textDocument)
        this.documentUri = textDocument.uri
    }

    public override async sendUpdateMessage(updatedTextDocument: vscode.TextDocument) {
        const logger: Logger = getLogger()
        const isYaml = updatedTextDocument.languageId === YAML_ASL
        const text = updatedTextDocument.getText()
        let stateMachineData = text
        let yamlErrors: string[] = []

        if (isYaml) {
            const parsed = yaml.parseDocument(text, YAML_OPTIONS)
            yamlErrors = parsed.errors.map(error => error.message)
            let json: any

            try {
                json = parsed.toJSON()
            } catch (e) {
                yamlErrors.push(e.message)
            }

            stateMachineData = JSON.stringify(json)
        }

        const isValid = (await isDocumentValid(stateMachineData, updatedTextDocument)) && !yamlErrors.length

        const webview = this.getWebview()
        if (this.isPanelDisposed || !webview) {
            return
        }

        logger.debug('Sending update message to webview.')

        webview.postMessage({
            command: 'update',
            stateMachineData,
            isValid,
            errors: yamlErrors,
        })
    }

    protected override setupWebviewPanel(textDocument: vscode.TextDocument): vscode.WebviewPanel {
        const documentUri = textDocument.uri
        const logger: Logger = getLogger()

        // Create and show panel
        const panel = this.createVisualizationWebviewPanel(documentUri)

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
                    'Previewing ASL document. <a href="" style="text-decoration:none;">View</a>'
                ),
                notInSync: localize('AWS.stepFunctions.graph.status.notInSync', 'Errors detected. Cannot preview.'),
                syncing: localize('AWS.stepFunctions.graph.status.syncing', 'Rendering ASL graph...'),
            }
        )

        // Add listener function to update the graph on document save
        this.disposables.push(
            vscode.workspace.onDidSaveTextDocument(async savedTextDocument => {
                if (savedTextDocument && savedTextDocument.uri.path === documentUri.path) {
                    await this.sendUpdateMessage(savedTextDocument)
                }
            })
        )

        // If documentUri being tracked is no longer found (due to file closure or rename), close the panel.
        this.disposables.push(
            vscode.workspace.onDidCloseTextDocument(documentWillSaveEvent => {
                if (!this.trackedDocumentDoesExist(documentUri) && !this.isPanelDisposed) {
                    panel.dispose()
                    vscode.window.showInformationMessage(
                        localize(
                            'AWS.stepfunctions.visualisation.errors.rename',
                            'State machine visualization closed due to file renaming or closure.'
                        )
                    )
                }
            })
        )

        const debouncedUpdate = debounce(this.sendUpdateMessage.bind(this), 500)

        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(async textDocumentEvent => {
                if (textDocumentEvent.document.uri.path === documentUri.path) {
                    await debouncedUpdate(textDocumentEvent.document)
                }
            })
        )

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
                        await this.sendUpdateMessage(textDocument)
                        break
                    }

                    case 'viewDocument':
                        try {
                            const document = await vscode.workspace.openTextDocument(documentUri)
                            vscode.window.showTextDocument(document, vscode.ViewColumn.One)
                        } catch (e) {
                            logger.error(e as Error)
                        }
                        break
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

    protected override makeWebviewTitle(sourceDocumentUri: vscode.Uri): string {
        return localize('AWS.stepFunctions.graph.titlePrefix', 'Graph: {0}', path.basename(sourceDocumentUri.fsPath))
    }

    private trackedDocumentDoesExist(trackedDocumentURI: vscode.Uri): boolean {
        const document = vscode.workspace.textDocuments.find(doc => doc.fileName === trackedDocumentURI.fsPath)

        return document !== undefined
    }
}
