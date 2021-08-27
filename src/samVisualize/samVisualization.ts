/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import { basename, join } from 'path'
import { generateGraphFromYaml } from './graphGeneration/cfnTemplateGraphGenerator'
import { generateResourceLineMap, ResourceLineMap } from './rendering/navigation'
import { readFileSync } from 'fs-extra'
import * as vscode from 'vscode'
import * as _ from 'lodash'
import { generateIconsMap } from './rendering/icons'
import { MessageTypes } from './samVisualizeTypes'
import { showLogOutputChannel } from '../shared/logger'

export interface MessageObject {
    command: MessageTypes
    data?: any
}

export class SamVisualization {
    private textDocument: vscode.TextDocument
    // Used to support navigation between webview and template
    private resourceLineMap: ResourceLineMap
    // Used to establish paths to resources that the webview uses
    private readonly extensionContext: vscode.ExtensionContext
    // To let the extension know a visualization has been closed
    private readonly onVisualizationDisposeEmitter = new vscode.EventEmitter<void>()

    protected isPanelDisposed = false

    /**
     * The webviewPanel holding the visualization
     */
    public webviewPanel: vscode.WebviewPanel

    /**
     * The URI associated with the TextDocument containing the template being rendered
     */
    public readonly textDocumentUri: vscode.Uri

    /**
     * Tracks the listeners attached to the webview, to be disposed when the webview is disposed.
     */
    public disposables: vscode.Disposable[] = []

    public constructor(textDocument: vscode.TextDocument, extensionContext: vscode.ExtensionContext) {
        this.extensionContext = extensionContext
        this.textDocument = textDocument
        this.textDocumentUri = textDocument.uri
        this.resourceLineMap = generateResourceLineMap(textDocument.getText())
        this.webviewPanel = this.setUpWebviewPanel(textDocument)
    }

    /**
     * Reveals the webviewPanel for this visualization
     */
    public revealPanel(): void {
        if (!this.isPanelDisposed) {
            this.webviewPanel.reveal()
        }
    }

    private createWebviewPanel(textDocument: vscode.TextDocument): vscode.WebviewPanel {
        const panel = vscode.window.createWebviewPanel(
            'samVisualization',
            localize('AWS.samVisualizer.graph.titleSuffix', '{0} (Rendering)', basename(textDocument.fileName)),
            {
                preserveFocus: true,
                viewColumn: vscode.ViewColumn.Beside,
            },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        )

        const graphObject = generateGraphFromYaml(textDocument.getText(), textDocument.fileName)

        // A mock extensionContext is used during testing
        // If the extensionPath is an empty string, extensionContext.asAbsolutePath will not work
        // Skip resource fetching during tests here, they're tested in the their own suites.
        // Eg. icons.tests.ts tests the fetching of the icons, navigation.test.ts tests the fetching of primary resources etc.
        if (this.extensionContext.extensionPath !== '') {
            const primaryResourceList = JSON.parse(
                readFileSync(
                    this.extensionContext.asAbsolutePath(join('resources', 'light', 'samVisualize', 'resources.json'))
                ).toString()
            )['primaryResources']

            const iconsDir = this.extensionContext.asAbsolutePath(join('resources', 'light', 'samVisualize', 'icons'))

            const iconsData = generateIconsMap(iconsDir, panel.webview)

            const webviewStylesheetUri = panel.webview.asWebviewUri(
                vscode.Uri.file(this.extensionContext.asAbsolutePath(join('media', 'css', 'samVisualize.css')))
            )

            const webviewBodyScriptUri = panel.webview.asWebviewUri(
                // Change those file names
                vscode.Uri.file(
                    this.extensionContext.asAbsolutePath(
                        join('dist', 'src', 'samVisualize', 'samVisualizeRenderBundle.js')
                    )
                )
            )
            panel.webview.html = this.getWebviewContent(
                JSON.stringify(graphObject),
                JSON.stringify(primaryResourceList),
                JSON.stringify(iconsData),
                webviewStylesheetUri,
                webviewBodyScriptUri,
                panel.webview.cspSource
            )
        }
        return panel
    }
    private setUpWebviewPanel(textDocument: vscode.TextDocument): vscode.WebviewPanel {
        const panel = this.createWebviewPanel(textDocument)

        // To close the visualization if the associated template no longer exists
        this.disposables.push(
            vscode.workspace.onDidCloseTextDocument(e => {
                if (!this.templateDoesExist() && !this.isPanelDisposed) {
                    panel.dispose()
                    vscode.window.showErrorMessage('Template associated with visualization closed or renamed')
                }
            })
        )

        const debounceInterval = 1000
        const debouncedUpdate = _.debounce(this.updateVisualization.bind(this), debounceInterval)

        // Update the visualization on template change
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(async changedTextDocument => {
                if (changedTextDocument.document.uri.path === this.textDocumentUri.path) {
                    debouncedUpdate(changedTextDocument.document.getText())
                }
            })
        )

        // Handle click events from the webview
        this.disposables.push(
            panel.webview.onDidReceiveMessage((message: MessageObject) => {
                switch (message.command) {
                    case MessageTypes.NavigateFromGraph: {
                        // Reveal the template to the left of the webview, unless the webview is in the first column.
                        // In this case, reveal to the right. This way, the template will also reveal beside the webview.
                        const columnToShow =
                            this.webviewPanel.viewColumn === vscode.ViewColumn.One
                                ? vscode.ViewColumn.Two
                                : this.webviewPanel.viewColumn!.valueOf() - 1

                        vscode.window
                            .showTextDocument(this.textDocument, { preserveFocus: true, viewColumn: columnToShow })
                            .then(activeEditor => {
                                //resource name for clicked resource stored in message.data
                                const pos = this.resourceLineMap[message.data]
                                if (pos) {
                                    //const decorations: vscode.DecorationOptions[] = []
                                    const startPosition = activeEditor.document
                                        .positionAt(pos.start)
                                        .with({ character: 0 })
                                    const endPosition = activeEditor.document.positionAt(pos.end)
                                    const range = new vscode.Range(startPosition, endPosition)
                                    activeEditor.revealRange(range, vscode.TextEditorRevealType.InCenter)
                                    //decorations.push({ range })
                                    //activeEditor.setDecorations(decorationType, decorations)
                                    activeEditor.selection = new vscode.Selection(range.start, range.end)
                                }
                            })
                        break
                    }
                    case MessageTypes.ViewLogs: {
                        showLogOutputChannel()
                        break
                    }
                }
            })
        )
        let cursorListener: NodeJS.Timeout
        // Listens for a change in the active editor
        // If the text document containing the rendered template gets focus, begin listening for cursor position
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor?.document.uri.path === this.textDocumentUri.path) {
                    cursorListener = setInterval(() => {
                        const cursorPosition = editor.document.offsetAt(editor.selection.active)
                        for (const [key, value] of Object.entries(this.resourceLineMap)) {
                            if (cursorPosition >= value.start && cursorPosition <= value.end) {
                                this.webviewPanel.webview.postMessage({
                                    command: MessageTypes.NavigateFromTemplate,
                                    data: key,
                                })
                                return
                            }
                        }
                        // Cursor not in any resource, send message to de-focus previously selected node in the graph
                        this.webviewPanel.webview.postMessage({
                            command: MessageTypes.ClearNodeFocus,
                        })
                    }, 500)
                } else {
                    clearInterval(cursorListener)
                    // Template no longer has focus, send message to de-focus previously selected node in the graph
                    this.webviewPanel.webview.postMessage({
                        command: MessageTypes.ClearNodeFocus,
                    })
                }
            })
        )

        panel.onDidDispose(() => {
            if (this.isPanelDisposed) {
                return
            }
            clearInterval(cursorListener)
            this.isPanelDisposed = true
            debouncedUpdate.cancel()
            this.onVisualizationDisposeEmitter.fire()
            this.disposables.forEach(disposable => {
                disposable.dispose()
            })
            this.onVisualizationDisposeEmitter.dispose()
        })

        return panel
    }

    // Updates the visualization with the newly edited YAML
    private updateVisualization(yamlString: string) {
        const newGraphObject = generateGraphFromYaml(yamlString, this.textDocument.fileName)

        // We want to post the graphObject even if it is undefined,
        // as the rendering code will render an error message if it is undefined.
        this.webviewPanel.webview.postMessage({
            command: MessageTypes.UpdateVisualization,
            data: newGraphObject,
        })

        this.resourceLineMap = generateResourceLineMap(yamlString)
    }

    private getWebviewContent(
        graphObjectString: string,
        primaryResourceListString: string,
        iconDataString: string,
        webviewStylesheetUri: vscode.Uri,
        webviewRenderScriptUri: vscode.Uri,
        cspSource: string
    ) {
        return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" 
        content="default-src 'none'; 
        img-src ${cspSource} https:; 
        script-src ${cspSource} 'self' 'unsafe-inline' 'unsafe-eval'; 
        style-src ${cspSource}; "/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href='${webviewStylesheetUri}'>
        <script src='${webviewRenderScriptUri}'></script>
        <title>Template Graph</title>

    </head>
    <body>
        <script>
            new samVisualize.ForceDirectedGraph(${graphObjectString},${primaryResourceListString},${iconDataString})
        </script>
    </body>
    </html>`
    }

    private templateDoesExist(): boolean {
        return !!vscode.workspace.textDocuments.some(doc => doc.fileName === this.textDocument.uri.fsPath)
    }

    public get onVisualizationDisposeEvent(): vscode.Event<void> {
        return this.onVisualizationDisposeEmitter.event
    }
}
