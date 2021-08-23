/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import { basename, join } from 'path'
import { generateGraphFromYaml } from '../graphGeneration/cfnTemplateGraphGenerator'
import { generateResourceLineMap, ResourceLineMap } from '../rendering/navigation'
import { readFileSync } from 'fs-extra'
import * as vscode from 'vscode'
import * as _ from 'lodash'
import { generateIconsMap } from '../rendering/icons'
export class SamVisualization {
    private textDocument: vscode.TextDocument

    private resourceLineMap: ResourceLineMap | undefined
    // Used to establish paths to resources that the webview uses
    private readonly extensionContext: vscode.ExtensionContext
    // To let the extension know a visualization has been closed
    private readonly onVisualizationDisposeEmitter = new vscode.EventEmitter<void>()

    /**
     * The webviewPanel holding the visualization
     */
    public webviewPanel: vscode.WebviewPanel | undefined

    /**
     * The URI associated with the TextDocument containing the template being rendered
     */
    public readonly textDocumentUri: vscode.Uri

    public disposables: vscode.Disposable[] = []

    public constructor(textDocument: vscode.TextDocument, extensionContext: vscode.ExtensionContext) {
        this.extensionContext = extensionContext
        this.textDocument = textDocument
        this.textDocumentUri = textDocument.uri
        this.webviewPanel = this.setUpWebviewPanel(textDocument)
    }

    /**
     * Reveals the webviewPanel for this visualization
     */
    public revealPanel(): void {
        this.webviewPanel?.reveal()
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

        try {
            const graphObject = generateGraphFromYaml(textDocument.getText())

            // Only generate a ResourceLineMap if the input has generated a valid GraphObject.
            if (graphObject) {
                this.resourceLineMap = generateResourceLineMap(textDocument.getText())
            }

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
        } catch {
            // During tests, a mock context is used, so the absolute paths will not resolve.
            // Skip the fetching of particular resources.
        }

        return panel
    }
    private setUpWebviewPanel(textDocument: vscode.TextDocument): vscode.WebviewPanel | undefined {
        const panel = this.createWebviewPanel(textDocument)

        // To close the visualization if the associated template no longer exists
        this.disposables.push(
            vscode.workspace.onDidCloseTextDocument(e => {
                if (!this.templateDoesExist() && this.webviewPanel) {
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
            panel.webview.onDidReceiveMessage(message => {
                // Reveal the template to the left of the webview, unless the webview is in the first column.
                // In this case, reveal to the right. This way, the template will also reveal beside the webview.
                const columnToShow =
                    this.webviewPanel!.viewColumn === vscode.ViewColumn.One
                        ? vscode.ViewColumn.Two
                        : this.webviewPanel!.viewColumn!.valueOf() - 1

                vscode.window
                    .showTextDocument(this.textDocument, { preserveFocus: true, viewColumn: columnToShow })
                    .then(activeEditor => {
                        //resource name for clicked resource stored in message.data
                        const pos = this.resourceLineMap![message.data]
                        if (pos) {
                            //const decorations: vscode.DecorationOptions[] = []
                            const startPosition = activeEditor.document.positionAt(pos.start).with({ character: 0 })
                            const endPosition = activeEditor.document.positionAt(pos.end)
                            const range = new vscode.Range(startPosition, endPosition)
                            activeEditor.revealRange(range, vscode.TextEditorRevealType.InCenter)
                            //decorations.push({ range })
                            //activeEditor.setDecorations(decorationType, decorations)
                            activeEditor.selection = new vscode.Selection(range.start, range.end)
                        }
                    })
            })
        )

        panel.onDidDispose(() => {
            this.webviewPanel = undefined
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
        const newGraphObject = generateGraphFromYaml(yamlString)

        // We want to post the graphObject even if it is undefined,
        // as the rendering code will render an error message if it is undefined.
        this.webviewPanel?.webview.postMessage({
            graphObject: newGraphObject,
        })

        // Only generate a ResourceLineMap if the input has generated a valid GraphObject.
        if (newGraphObject) {
            const newResourceLineMap = generateResourceLineMap(yamlString)
            // Update the resourceLineMap
            this.resourceLineMap = newResourceLineMap
        }
    }

    private getWebviewContent(
        graphObjectString: string,
        primaryResourceListString: string,
        iconDataString: string,
        webviewStylesheetUri: vscode.Uri,
        webviewRenderScriptUri: vscode.Uri,
        cspSource: string
    ) {
        // Library exported by webpack is GraphRender
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
            new GraphRender.ForceDirectedGraph(${graphObjectString},${primaryResourceListString},${iconDataString})
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
