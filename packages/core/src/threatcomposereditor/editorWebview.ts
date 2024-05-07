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
import { addFileWatchMessageHandler } from './messageHandlers/addFileWatchMessageHandler'
import { addThemeWatchMessageHandler } from './messageHandlers/addThemeWatchMessageHandler'
import { sendThreatComposerOpenCancelled } from './messageHandlers/emitTelemetryMessageHandler'

const localize = nls.loadMessageBundle()

export class ThreatComposer {
    public readonly documentUri: vscode.Uri
    public webviewPanel: vscode.WebviewPanel
    protected readonly disposables: vscode.Disposable[] = []
    protected isPanelDisposed = false
    private readonly onVisualizationDisposeEmitter = new vscode.EventEmitter<void>()
    public workSpacePath: string
    public defaultTemplatePath: string
    public defaultTemplateName: string
    // fileWatches is used to monitor template file changes and achieve bi-direction sync
    public fileWatches: Record<string, FileWatchInfo>

    // autoSaveFileWatches is used to monitor local file changes and achieve bi-direction sync
    public autoSaveFileWatches: Record<string, FileWatchInfo>
    private getWebviewContent: () => string

    public constructor(
        textDocument: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        context: vscode.ExtensionContext,
        getWebviewContent: () => string
    ) {
        this.getWebviewContent = getWebviewContent
        this.documentUri = textDocument.uri
        this.webviewPanel = webviewPanel
        this.fileWatches = {}
        this.autoSaveFileWatches = {}
        this.workSpacePath = path.dirname(textDocument.uri.fsPath)
        this.defaultTemplatePath = textDocument.uri.fsPath
        this.defaultTemplateName = path.basename(this.defaultTemplatePath)
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

    private setupWebviewPanel(textDocument: vscode.TextDocument, context: vscode.ExtensionContext) {
        const documentUri = textDocument.uri

        const contextObject: WebviewContext = {
            panel: this.webviewPanel,
            textDocument: textDocument,
            disposables: this.disposables,
            workSpacePath: this.workSpacePath,
            defaultTemplatePath: this.defaultTemplatePath,
            defaultTemplateName: this.defaultTemplateName,
            fileWatches: this.fileWatches,
            autoSaveFileWatches: this.autoSaveFileWatches,
            loaderNotification: undefined,
        }

        async function cancelOpenInThreatComposer(reason: string) {
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
            await vscode.commands.executeCommand('vscode.openWith', documentUri, 'default')
            sendThreatComposerOpenCancelled({ reason: reason })
        }

        void vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Opening file in Threat Composer',
                cancellable: true,
            },
            (progress, token) => {
                let autoCloseNotificationTimeoutID: NodeJS.Timeout

                token.onCancellationRequested(async () => {
                    if (autoCloseNotificationTimeoutID) {
                        clearTimeout(autoCloseNotificationTimeoutID)
                    }

                    console.log('User canceled opening in TC operation')
                    await cancelOpenInThreatComposer('User canceled opening in THreatComposer operation')
                })

                progress.report({ increment: 0 })

                return new Promise<void>(resolve => {
                    autoCloseNotificationTimeoutID = setTimeout(async () => {
                        resolve()
                        // const errorMessage = "ThreatComposer took too long to open"
                        // await cancelOpenInThreatComposer(errorMessage)
                        // await vscode.window.showErrorMessage(errorMessage)
                    }, 10000)

                    contextObject.loaderNotification = {
                        progress: progress,
                        cancellationToken: token,
                        promiseResolve: () => {
                            clearTimeout(autoCloseNotificationTimeoutID)
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

                    addFileWatchMessageHandler(contextObject)
                    addThemeWatchMessageHandler(contextObject)

                    // Handle messages from the webview
                    this.disposables.push(
                        this.webviewPanel.webview.onDidReceiveMessage(message => handleMessage(message, contextObject))
                    )

                    // When the panel is closed, dispose of any disposables/remove subscriptions
                    const disposePanel = async () => {
                        if (this.isPanelDisposed) {
                            return
                        }

                        await telemetry.threatcomposer_closed.run(async span => {
                            this.isPanelDisposed = true
                            this.onVisualizationDisposeEmitter.fire()
                            this.disposables.forEach(disposable => {
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
                    this.webviewPanel.webview.html = this.getWebviewContent()

                    progress.report({ increment: 20 })
                })
            }
        )
    }

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

        if (vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light) {
            this.webviewPanel.iconPath = vscode.Uri.file(
                context.asAbsolutePath(path.join('resources', 'icons', 'aws', 'applicationcomposer', 'icon.svg'))
            )
        } else {
            this.webviewPanel.iconPath = vscode.Uri.file(
                context.asAbsolutePath(path.join('resources', 'icons', 'aws', 'applicationcomposer', 'icon-dark.svg'))
            )
        }
    }
}
