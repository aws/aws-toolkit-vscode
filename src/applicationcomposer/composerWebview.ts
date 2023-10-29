/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { join } from 'path'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import * as path from 'path'
import * as vscode from 'vscode'
import { handleCommand } from './handleCommand'

export class ApplicationComposer {
    public readonly documentUri: vscode.Uri
    public readonly webviewPanel: vscode.WebviewPanel
    protected readonly disposables: vscode.Disposable[] = []
    protected isPanelDisposed = false
    private readonly onVisualizationDisposeEmitter = new vscode.EventEmitter<void>()

    public constructor(textDocument: vscode.TextDocument, context: vscode.ExtensionContext) {
        this.documentUri = textDocument.uri
        this.webviewPanel = this.setupWebviewPanel(textDocument, context)
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

    protected getText(textDocument: vscode.TextDocument): string {
        return textDocument.getText()
    }

    private setupWebviewPanel(
        textDocument: vscode.TextDocument,
        context: vscode.ExtensionContext
    ): vscode.WebviewPanel {
        const documentUri = textDocument.uri

        // Create and show panel
        const panel = this.createVisualizationWebviewPanel(documentUri, context)

        // Set the initial html for the webpage
        panel.webview.html = this.getWebviewContent()

        // Handle messages from the webview
        this.disposables.push(
            panel.webview.onDidReceiveMessage(message =>
                handleCommand(message, {
                    panel: panel,
                    textDocument: textDocument,
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

    private createVisualizationWebviewPanel(
        documentUri: vscode.Uri,
        context: vscode.ExtensionContext
    ): vscode.WebviewPanel {
        const panel = vscode.window.createWebviewPanel(
            'applicationComposer',
            localize('AWS.applicationComposer.title', '{0} (Application Composer)', path.basename(documentUri.fsPath)),
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

    // TODO: This only works on localhost right now. We need to do some testing once we have a non-console CDN working.
    private getWebviewContent(): string {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
        <base href="http://127.0.0.1:3000/" >
            <script>self["MonacoEnvironment"] = (function (paths) {
                return {
                    globalAPI: false,
                    getWorkerUrl : function (moduleId, label) {
                    var result =  paths[label];
                    if (/^((http:)|(https:)|(file:)|(\/\/))/.test(result)) {
                        var currentUrl = String(window.location);
                        var currentOrigin = currentUrl.substr(0, currentUrl.length - window.location.hash.length - window.location.search.length - window.location.pathname.length);
                        if (result.substring(0, currentOrigin.length) !== currentOrigin) {
                        var js = '/*' + label + '*/importScripts("' + result + '");';
                        var blob = new Blob([js], { type: 'application/javascript' });
                        return URL.createObjectURL(blob);
                        }
                    }
                    return result;
                    }
                };
                })({
        "json": "/monacoeditorwork/json.worker.bundle.js",
        "yaml": "/monacoeditorwork/yaml.worker.bundle.js"
        });</script>
            <script type="module">
        import RefreshRuntime from "/@react-refresh"
        RefreshRuntime.injectIntoGlobalHook(window)
        window.$RefreshReg$ = () => {}
        window.$RefreshSig$ = () => (type) => type
        window.__vite_plugin_react_preamble_installed__ = true
        </script>
            <script type="module" src="/@vite/client"></script>
            <meta charset="UTF-8" />
            <meta name="description" content="File used to serve Application Composer" />
            <title>Application Composer</title>
        </head>
        <body>
            <div id="app"></div>
            <script type="module" src="/main.js?isDarkMode=true"></script>
        </body>
        </html>
        `
    }
}
