/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import * as path from 'path'
import * as vscode from 'vscode'
import { handleMessage } from './handleMessage'
import { FileWatchInfo, WebviewContext } from './types'
import { telemetry } from '../shared/telemetry/telemetry'
import { onFileChanged } from './handlers/onFileChangedHandler'
import { onThemeChanged } from './handlers/onThemeChangedHandler'
import { sendThreatComposerOpenCancelled } from './handlers/webviewTelemetryHandler'
import { getLogger } from '../shared/logger'

const localize = nls.loadMessageBundle()

/**
 * The main class for the Threat Composer Editor. This class handles the creation and management
 * of the webview panel for the Threat Composer Editor. It also handles the communication
 * between the webview and the extension context. This class also stores the state of the
 * tc.json file, that is being edited in the webview panel, in the property 'fileStates'. The
 * 'autoSaveFileStates' property is used to store local changes that are being made in the
 * webview panel.
 */
export class ThreatComposerEditor {
    public readonly documentUri: vscode.Uri
    public webviewPanel: vscode.WebviewPanel
    protected readonly disposables: vscode.Disposable[] = []
    protected isPanelDisposed = false
    private readonly onVisualizationDisposeEmitter = new vscode.EventEmitter<void>()
    private fileId: string
    public workSpacePath: string
    public defaultTemplatePath: string
    public defaultTemplateName: string
    // fileStates is used to store the state of the file being edited and achieve bi-direction sync
    public fileStates: Record<string, FileWatchInfo>
    // autoSaveFileStates is used to store local changes that are being made in the webview panel.
    public autoSaveFileStates: Record<string, FileWatchInfo>
    private getWebviewContent: () => Promise<string>

    public constructor(
        textDocument: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        context: vscode.ExtensionContext,
        fileId: string,
        getWebviewContent: () => Promise<string>
    ) {
        this.getWebviewContent = getWebviewContent
        this.documentUri = textDocument.uri
        this.webviewPanel = webviewPanel
        this.fileStates = {}
        this.autoSaveFileStates = {}
        this.workSpacePath = path.dirname(textDocument.uri.fsPath)
        this.defaultTemplatePath = textDocument.uri.fsPath
        this.defaultTemplateName = path.basename(this.defaultTemplatePath)
        this.fileId = fileId

        this.setupWebviewPanel(textDocument, context)
    }

    public get onVisualizationDisposeEvent(): vscode.Event<void> {
        return this.onVisualizationDisposeEmitter.event
    }

    public getPanel(): vscode.WebviewPanel | undefined {
        if (!this.isPanelDisposed) {
            return this.webviewPanel
        }
    }

    public showPanel(): void {
        this.getPanel()?.reveal()
    }

    public async refreshPanel(context: vscode.ExtensionContext) {
        if (!this.isPanelDisposed) {
            this.webviewPanel.dispose()
            const document = await vscode.workspace.openTextDocument(this.documentUri)
            this.setupWebviewPanel(document, context)
        }
    }

    protected getText(textDocument: vscode.TextDocument): string {
        return textDocument.getText()
    }

    /**
     * Sets up the webview panel for the Threat Composer Editor. This includes creating the
     * panel, setting up the webview content, and handling the communication between the webview
     * and the extension context.
     * @param textDocument The text document to be displayed in the webview panel.
     * @param context The extension context.
     * @private
     */
    private setupWebviewPanel(textDocument: vscode.TextDocument, context: vscode.ExtensionContext) {
        const documentUri = textDocument.uri

        const contextObject: WebviewContext = {
            panel: this.webviewPanel,
            textDocument: textDocument,
            disposables: this.disposables,
            workSpacePath: this.workSpacePath,
            defaultTemplatePath: this.defaultTemplatePath,
            defaultTemplateName: this.defaultTemplateName,
            fileStates: this.fileStates,
            autoSaveFileState: this.autoSaveFileStates,
            loaderNotification: undefined,
            fileId: this.fileId,
        }

        async function cancelOpenInThreatComposer(reason: string) {
            contextObject.panel.dispose()
            await vscode.commands.executeCommand('vscode.openWith', documentUri, 'default')
            sendThreatComposerOpenCancelled({
                reason: reason,
                id: contextObject.fileId,
            })
        }

        void vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Opening file in Threat Composer',
                cancellable: true,
            },
            (progress, token) => {
                token.onCancellationRequested(async () => {
                    getLogger().debug('User canceled opening in TC operation')
                    await cancelOpenInThreatComposer('User canceled opening in THreatComposer operation')
                })

                progress.report({ increment: 0 })

                return new Promise<void>(async (resolve) => {
                    contextObject.loaderNotification = {
                        progress: progress,
                        cancellationToken: token,
                        promiseResolve: () => {
                            resolve()
                        },
                    }

                    // Initialise the panel panel
                    this.initialiseVisualizationWebviewPanel(documentUri, context)

                    // Hook up event handlers so that we can synchronize the webview with the text document.
                    //
                    // The text document acts as our model, so we have to sync change in the document to our
                    // editor and sync changes in the editor back to the document.
                    //
                    // Remember that a single text document can also be shared between multiple custom
                    // editors (this happens for example when you split a custom editor)

                    contextObject.disposables.push(
                        vscode.workspace.onDidChangeTextDocument(async () => {
                            await onFileChanged(contextObject)
                        })
                    )

                    // Hook up event handler to update the UI on theme changes within VSCode.
                    contextObject.disposables.push(
                        vscode.window.onDidChangeActiveColorTheme(async (data) => {
                            await onThemeChanged(data, contextObject.panel)
                        })
                    )

                    // Handle messages from the webview
                    this.disposables.push(
                        this.webviewPanel.webview.onDidReceiveMessage((message) =>
                            handleMessage(message, contextObject)
                        )
                    )

                    // When the panel is closed, dispose of any disposables/remove subscriptions
                    const disposePanel = async () => {
                        if (this.isPanelDisposed) {
                            return
                        }

                        await telemetry.threatComposer_closed.run(async (span) => {
                            span.record({
                                id: this.fileId,
                            })
                            this.isPanelDisposed = true
                            contextObject.loaderNotification?.promiseResolve()
                            this.onVisualizationDisposeEmitter.fire()
                            this.disposables.forEach((disposable) => {
                                disposable.dispose()
                            })
                            this.onVisualizationDisposeEmitter.dispose()
                        })
                    }

                    this.disposables.push(
                        this.webviewPanel.onDidDispose(async () => {
                            await disposePanel()
                        })
                    )

                    progress.report({ increment: 10 })

                    // Set the initial html for the webpage
                    this.webviewPanel.webview.html = await this.getWebviewContent()

                    progress.report({ increment: 20 })
                })
            }
        )
    }

    /**
     * Initialises the webview panel for the Threat Composer Editor. This includes setting up the
     * panel's title and webview options.
     * @param documentUri
     * @param context
     * @private
     */
    private initialiseVisualizationWebviewPanel(documentUri: vscode.Uri, context: vscode.ExtensionContext) {
        // Setup initial content for the webview
        this.webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [context.extensionUri],
        }

        this.webviewPanel.title = localize(
            'AWS.threatComposer.page.title',
            '{0} (Threat Composer)',
            path.basename(documentUri.fsPath)
        )
    }
}
