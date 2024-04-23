/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import * as path from 'path'
import * as vscode from 'vscode'
import { handleMessage } from './handleMessage'
import { FileWatchInfo } from './types'
import { addFileWatchMessageHandler } from './messageHandlers/addFileWatchMessageHandler'
import { addThemeWatchMessageHandler } from './messageHandlers/addThemeWatchMessageHandler'

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

        // Initialise the panel panel
        this.initialiseVisualizationWebviewPanel(documentUri, context)

        const contextObject = {
            panel: this.webviewPanel,
            textDocument: textDocument,
            disposables: this.disposables,
            workSpacePath: this.workSpacePath,
            defaultTemplatePath: this.defaultTemplatePath,
            defaultTemplateName: this.defaultTemplateName,
            fileWatches: this.fileWatches,
            autoSaveFileWatches: this.autoSaveFileWatches,
        }
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
        const disposePanel = () => {
            if (this.isPanelDisposed) {
                return
            }
            this.isPanelDisposed = true
            this.onVisualizationDisposeEmitter.fire()
            this.disposables.forEach(disposable => {
                disposable.dispose()
            })
            this.onVisualizationDisposeEmitter.dispose()
        }

        this.disposables.push(
            this.webviewPanel.onDidDispose(() => {
                disposePanel()
            })
        )

        // Set the initial html for the webpage
        this.webviewPanel.webview.html = this.getWebviewContent()
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
