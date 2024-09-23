/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { telemetry } from '../../shared/telemetry/telemetry'
import { getLogger } from '../../shared/logger'
import { i18n } from '../../shared/i18n-helper'
import { WebviewContext } from './types'
import { CancellationError } from '../../shared/utilities/timeoutUtils'

/**
 * The main class for Workflow Studio Editor. This class handles the creation and management
 * of the webview panel for integration. It also handles the communication
 * between the webview and the extension context. This class stores the state of the
 * local file that is being edited in the webview panel, in the property 'fileStates'. The
 * 'autoSaveFileStates' property is used to store local changes that are being made in the
 * webview panel.
 */
export class WorkflowStudioEditor {
    public readonly documentUri: vscode.Uri
    public webviewPanel: vscode.WebviewPanel
    protected readonly disposables: vscode.Disposable[] = []
    protected isPanelDisposed = false
    private readonly onVisualizationDisposeEmitter = new vscode.EventEmitter<void>()
    private fileId: string
    public workSpacePath: string
    public defaultTemplatePath: string
    public defaultTemplateName: string
    // TODO: add fileStates and autoSaveFileStates variables to store the state of the file and handle auto-save
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
        this.workSpacePath = path.dirname(textDocument.uri.fsPath)
        this.defaultTemplatePath = textDocument.uri.fsPath
        this.defaultTemplateName = path.basename(this.defaultTemplatePath)
        this.fileId = fileId

        telemetry.stepfunctions_openWorkflowStudio.record({
            id: this.fileId,
        })

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
     * Sets up the webview panel for Workflow Studio Editor. This includes creating the
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
            loaderNotification: undefined,
            fileId: this.fileId,
        }

        void vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: i18n('AWS.stepFunctions.workflowStudio.actions.progressMessage'),
                cancellable: true,
            },
            (progress, token) => {
                token.onCancellationRequested(async () => {
                    // Cancel opening in Worflow Studio and open regular code editor instead
                    getLogger().debug('WorkflowStudio: Canceled opening')
                    contextObject.panel.dispose()
                    await vscode.commands.executeCommand('vscode.openWith', documentUri, 'default')
                    throw new CancellationError('user')
                })

                progress.report({ increment: 0 })

                return new Promise<void>(async (resolve) => {
                    contextObject.loaderNotification = {
                        progress: progress,
                        cancellationToken: token,
                        resolve,
                    }

                    // Initialise webview panel for Workflow Studio and set up initial content
                    this.webviewPanel.webview.options = {
                        enableScripts: true,
                        localResourceRoots: [context.extensionUri],
                    }

                    // Set the initial html for the webpage
                    this.webviewPanel.webview.html = await this.getWebviewContent()
                    progress.report({ increment: 15 })

                    // TODO: Hook up event handlers so that we can synchronize the webview with the text document.
                    // Note that a single text document can also be shared between multiple custom
                    // editors (e.g. this can happen when you split a custom editor)

                    // When the panel is closed, dispose of any disposables/remove subscriptions
                    this.disposables.push(
                        this.webviewPanel.onDidDispose(() => {
                            if (this.isPanelDisposed) {
                                return
                            }

                            this.isPanelDisposed = true
                            resolve()
                            this.onVisualizationDisposeEmitter.fire()
                            this.disposables.forEach((disposable) => {
                                disposable.dispose()
                            })
                            this.onVisualizationDisposeEmitter.dispose()
                        })
                    )
                    progress.report({ increment: 15 })
                })
            }
        )
    }
}
