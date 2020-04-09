/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    DiagnosticSeverity,
    DocumentLanguageSettings,
    getLanguageService,
    TextDocument as ASLTextDocument,
} from 'amazon-states-language-service'

import { debounce } from 'lodash'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as path from 'path'
import * as vscode from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { getLogger, Logger } from '../../shared/logger'
import { StateMachineGraphCache } from '../utils'

export interface messageObject {
    command: string
    text: string
    error?: string
    stateMachineData: string
}

const documentSettings: DocumentLanguageSettings = { comments: 'error', trailingCommas: 'error' }
const languageService = getLanguageService({})

export class AslVisualizationManager {
    protected readonly managedVisualizations: Set<AslVisualization>

    public constructor() {
        this.managedVisualizations = new Set<AslVisualization>()
    }

    public getManagedVisualizations() {
        return this.managedVisualizations
    }

    public async visualizeStateMachine(globalStorage: vscode.Memento): Promise<vscode.WebviewPanel | void> {
        const logger: Logger = getLogger()
        const cache = new StateMachineGraphCache()

        /* TODO: Determine behaviour when command is run against bad input, or
         * non-json files. Determine if we want to limit the command to only a
         * specifc subset of file types ( .json only, custom .states extension, etc...)
         * Ensure tests are written for this use case as well.
         */
        const activeTextEditor: vscode.TextEditor | undefined = vscode.window.activeTextEditor

        let textDocument: vscode.TextDocument

        if (activeTextEditor) {
            textDocument = activeTextEditor.document
        } else {
            logger.error('Could not get active text editor for state machine render.')
            throw new Error('Could not get active text editor for state machine render.')
        }

        // Attempt to retrieve existing visualization if it exists.
        const existingVisualization = this.getExistingVisualization(textDocument)
        if (existingVisualization) {
            existingVisualization.showPanel()

            return existingVisualization.getPanel()
        }

        // Existing visualization does not exist, construct new visualization
        try {
            await cache.updateCache(globalStorage)

            return this.createNewVisualization(textDocument)
        } catch (err) {
            vscode.window.showInformationMessage(
                localize(
                    'AWS.stepfunctions.visualisation.errors.rendering',
                    'There was an error rendering State Machine Graph, check logs for details.'
                )
            )

            logger.debug('Unable to setup webview panel.')
            logger.error(err as Error)
        }

        return
    }

    public deleteVisualization(visualizationToDelete: AslVisualization) {
        this.managedVisualizations.delete(visualizationToDelete)
    }

    private createNewVisualization(textDocument: vscode.TextDocument): vscode.WebviewPanel | void {
        const newVisualization = new AslVisualization(textDocument)
        this.managedVisualizations.add(newVisualization)

        newVisualization.onVisualizationDispose()(() => {
            this.deleteVisualization(newVisualization)
        })

        return newVisualization.getPanel()
    }

    private getExistingVisualization(documentToFind: vscode.TextDocument): AslVisualization | void {
        for (const vis of this.managedVisualizations) {
            if (vis.documentUri.path === documentToFind.uri.path) {
                return vis
            }
        }

        return
    }
}

export class AslVisualization {
    public readonly documentUri: vscode.Uri
    public readonly webviewPanel: vscode.WebviewPanel
    protected readonly disposables: vscode.Disposable[]
    protected isPanelDisposed: boolean
    private readonly onVisualizationDisposeEmitter = new vscode.EventEmitter<void>()
    //private readonly onVisualizationDispose = this.onVisualizationDisposeEmitter.event

    public constructor(textDocument: vscode.TextDocument) {
        this.documentUri = textDocument.uri
        this.isPanelDisposed = false
        this.disposables = []
        this.webviewPanel = this.setupWebviewPanel(textDocument)
    }

    public onVisualizationDispose() {
        return this.onVisualizationDisposeEmitter.event
    }

    public getPanel(): vscode.WebviewPanel | void {
        if (this.webviewPanel && !this.isPanelDisposed) {
            return this.webviewPanel
        }
    }

    public getWebview(): vscode.Webview | void {
        if (this.webviewPanel && this.webviewPanel.webview && !this.isPanelDisposed) {
            return this.webviewPanel.webview
        }
    }

    public showPanel(): void {
        if (this.webviewPanel && !this.isPanelDisposed) {
            this.webviewPanel.reveal()
        }
    }

    private setupWebviewPanel(textDocument: vscode.TextDocument): vscode.WebviewPanel {
        const documentUri = textDocument.uri
        const logger: Logger = getLogger()

        // Create and show panel
        const panel = this.createVisualizationWebviewPanel(documentUri)

        // Set the initial html for the webpage
        panel.webview.html = this.getWebviewContent(
            ext.visualizationResourcePaths.webviewBodyScript.with({ scheme: 'vscode-resource' }),
            ext.visualizationResourcePaths.visualizationLibraryScript.with({ scheme: 'vscode-resource' }),
            ext.visualizationResourcePaths.visualizationLibraryCSS.with({ scheme: 'vscode-resource' }),
            ext.visualizationResourcePaths.stateMachineCustomThemeCSS.with({ scheme: 'vscode-resource' }),
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
                    await sendUpdateMessage(savedTextDocument)
                }
            })
        )

        // If documentUri being tracked is no longer found (due to file closure or rename), close the panel.
        this.disposables.push(
            vscode.workspace.onDidCloseTextDocument(documentWillSaveEvent => {
                if (!this.trackedDocumentDoesExist(documentUri)) {
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

        const sendUpdateMessage = async (updatedTextDocument: vscode.TextDocument) => {
            const isValid = await AslVisualization.isDocumentValid(updatedTextDocument)
            const webview = this.getWebview()
            if (this.isPanelDisposed || !webview) {
                return
            }

            logger.debug('Sending update message to webview.')

            webview.postMessage({
                command: 'update',
                stateMachineData: updatedTextDocument.getText(),
                isValid,
            })
        }
        const debouncedUpdate = debounce(sendUpdateMessage, 500).bind(this)

        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(async textDocumentEvent => {
                if (textDocumentEvent.document.uri.path === documentUri.path) {
                    await debouncedUpdate(textDocumentEvent.document)
                }
            })
        )

        // Handle messages from the webview
        this.disposables.push(
            panel.webview.onDidReceiveMessage(async (message: messageObject) => {
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
                        await sendUpdateMessage(textDocument)
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
        panel.onDidDispose(() => {
            this.onVisualizationDisposeEmitter.fire()
            for (const disposable of this.disposables) {
                disposable.dispose()
            }
            debouncedUpdate.cancel()
            this.onVisualizationDisposeEmitter.dispose()
            this.isPanelDisposed = true
        })

        return panel
    }

    private createVisualizationWebviewPanel(documentUri: vscode.Uri): vscode.WebviewPanel {
        return vscode.window.createWebviewPanel(
            'stateMachineVisualization',
            this.makeWebviewTitle(documentUri),
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

    private makeWebviewTitle(sourceDocumentUri: vscode.Uri): string {
        return localize('AWS.stepFunctions.graph.titlePrefix', 'Graph: {0}', path.basename(sourceDocumentUri.fsPath))
    }

    private getWebviewContent(
        webviewBodyScript: vscode.Uri,
        graphStateMachineLibrary: vscode.Uri,
        vsCodeCustomStyling: vscode.Uri,
        graphStateMachineDefaultStyles: vscode.Uri,
        statusTexts: {
            syncing: string
            notInSync: string
            inSync: string
        }
    ): string {
        return `
    <!DOCTYPE html>
    <html>
        <head>
            <meta charset="UTF-8">
            <link rel="stylesheet" href='${graphStateMachineDefaultStyles}'>
            <link rel="stylesheet" href='${vsCodeCustomStyling}'>
            <script src='${graphStateMachineLibrary}'></script>
        </head>

        <body>
            <div id="svgcontainer" class="workflowgraph">
                <svg></svg>
            </div>
            <div class="status-info">
                <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="50" cy="50" r="42" stroke-width="4" />
                </svg>
                <div class="status-messages">
                    <span class="previewing-asl-message">${statusTexts.inSync}</span>
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

    private trackedDocumentDoesExist(trackedDocumentURI: vscode.Uri): boolean {
        const document = vscode.workspace.textDocuments.find(doc => doc.fileName === trackedDocumentURI.fsPath)

        return document !== undefined
    }

    private static async isDocumentValid(textDocument?: vscode.TextDocument): Promise<boolean> {
        if (!textDocument) {
            return false
        }

        const text = textDocument.getText()
        const doc = ASLTextDocument.create(textDocument.uri.path, textDocument.languageId, textDocument.version, text)
        // tslint:disable-next-line: no-inferred-empty-object-type
        const jsonDocument = languageService.parseJSONDocument(doc)
        const diagnostics = await languageService.doValidation(doc, jsonDocument, documentSettings)

        const isValid = !diagnostics.some(diagnostic => diagnostic.severity === DiagnosticSeverity.Error)

        return isValid
    }
}
