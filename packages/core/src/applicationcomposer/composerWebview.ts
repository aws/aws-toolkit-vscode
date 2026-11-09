/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { join } from 'path'
import * as nls from 'vscode-nls'
import * as path from 'path'
import * as vscode from 'vscode'
import { handleMessage } from './handleMessage'
import { FileWatchInfo } from './types'

const localize = nls.loadMessageBundle()

export class ApplicationComposer {
    public readonly documentUri: vscode.Uri
    public webviewPanel: vscode.WebviewPanel = {} as vscode.WebviewPanel
    protected readonly disposables: vscode.Disposable[] = []
    protected isPanelDisposed = false
    private readonly onVisualizationDisposeEmitter = new vscode.EventEmitter<void>()
    public workSpacePath: string
    public defaultTemplatePath: string
    public defaultTemplateName: string

    private constructor(
        textDocument: vscode.TextDocument,
        private getWebviewContent: () => Promise<string>,
        public fileWatches: Record<string, FileWatchInfo> = {} // fileWatches is used to monitor template file changes and achieve bi-direction sync
    ) {
        this.getWebviewContent = getWebviewContent
        this.documentUri = textDocument.uri
        this.workSpacePath = path.dirname(textDocument.uri.fsPath)
        this.defaultTemplatePath = textDocument.uri.fsPath
        this.defaultTemplateName = path.basename(this.defaultTemplatePath)
    }

    public static async create(
        textDocument: vscode.TextDocument,
        context: vscode.ExtensionContext,
        getWebviewContent: () => Promise<string>
    ) {
        const obj = new ApplicationComposer(textDocument, getWebviewContent)
        obj.webviewPanel = await obj.setupWebviewPanel(textDocument, context)
        return obj
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
            this.webviewPanel = await this.setupWebviewPanel(document, context)
        }
    }

    protected getText(textDocument: vscode.TextDocument): string {
        return textDocument.getText()
    }

    private async setupWebviewPanel(
        textDocument: vscode.TextDocument,
        context: vscode.ExtensionContext
    ): Promise<vscode.WebviewPanel> {
        const documentUri = textDocument.uri

        // Create and show panel
        const panel = this.createVisualizationWebviewPanel(documentUri, context)

        // Set the initial html for the webpage
        panel.webview.html = await this.getWebviewContent()

        // Handle messages from the webview
        this.disposables.push(
            panel.webview.onDidReceiveMessage((message) =>
                handleMessage(message, {
                    panel: panel,
                    textDocument: textDocument,
                    disposables: this.disposables,
                    workSpacePath: this.workSpacePath,
                    defaultTemplatePath: this.defaultTemplatePath,
                    defaultTemplateName: this.defaultTemplateName,
                    fileWatches: this.fileWatches,
                })
            )
        )

        // When the panel is closed, dispose of any disposables/remove subscriptions
        const disposePanel = () => {
            if (this.isPanelDisposed) {
                return
            }
            this.isPanelDisposed = true
            this.onVisualizationDisposeEmitter.fire()
            for (const disposable of this.disposables) {
                disposable.dispose()
            }
            this.onVisualizationDisposeEmitter.dispose()
        }

        this.disposables.push(
            panel.onDidDispose(() => {
                disposePanel()
            })
        )

        return panel
    }

    private createVisualizationWebviewPanel(
        documentUri: vscode.Uri,
        context: vscode.ExtensionContext
    ): vscode.WebviewPanel {
        const panel = vscode.window.createWebviewPanel(
            'applicationComposer',
            localize(
                'AWS.applicationComposer.title',
                '{0} (Infrastructure Composer)',
                path.basename(documentUri.fsPath)
            ),
            {
                preserveFocus: true,
                viewColumn: vscode.ViewColumn.Active,
            },
            {
                enableScripts: true,
                localResourceRoots: [],
                retainContextWhenHidden: true,
            }
        )
        if (vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light) {
            panel.iconPath = vscode.Uri.file(
                context.asAbsolutePath(join('resources', 'icons', 'aws', 'applicationcomposer', 'icon.svg'))
            )
        } else {
            panel.iconPath = vscode.Uri.file(
                context.asAbsolutePath(join('resources', 'icons', 'aws', 'applicationcomposer', 'icon-dark.svg'))
            )
        }
        return panel
    }
}
