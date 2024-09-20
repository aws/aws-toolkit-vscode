/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import request from '../../shared/request'
import fs from '../../shared/fs/fs'
import { getClientId } from '../../shared/telemetry/util'
import { telemetry } from '../../shared/telemetry/telemetry'
import globals from '../../shared/extensionGlobals'
import { getRandomString, getStringHash } from '../../shared/utilities/textUtilities'
import { ToolkitError } from '../../shared/errors'
import { WorkflowStudioEditor } from './workflowStudioEditor'

// TODO: switch to production mode: change isLocalDev to false and add CDN link
const isLocalDev = true
const localhost = 'http://127.0.0.1:3002'
const cdn = 'TBD'
let clientId = ''

/**
 * Provider for Workflow Studio editors.
 *
 * Workflow Studio editor is used for `.asl.json`, `.asl.yaml` and `.asl.yml` files.
 * To get started, run this extension and open any file with one of these extensions in VS Code.
 */
export class WorkflowStudioEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = 'workflowStudio.asl'

    /**
     * Registers a new custom editor provider for `.tc.json` files.
     * @remarks This should only be called once per extension.
     * @param context The extension context
     */
    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new WorkflowStudioEditorProvider(context)
        return vscode.window.registerCustomEditorProvider(WorkflowStudioEditorProvider.viewType, provider, {
            webviewOptions: {
                enableFindWidget: true,
                retainContextWhenHidden: true, // Retain content when switching tabs
            },
        })
    }

    protected extensionContext: vscode.ExtensionContext
    protected webviewHtml: string
    protected readonly managedVisualizations = new Map<string, WorkflowStudioEditor>()
    protected readonly logger = getLogger()

    constructor(context: vscode.ExtensionContext) {
        this.extensionContext = context
        this.webviewHtml = ''
    }

    /**
     * Fetches the webview HTML from the CDN or local server.
     * @private
     */
    private async fetchWebviewHtml() {
        const source = isLocalDev ? localhost : cdn
        const response = await request.fetch('GET', `${source}/index.html`).response
        this.webviewHtml = await response.text()

        for (const visualization of this.managedVisualizations.values()) {
            await visualization.refreshPanel(this.extensionContext)
        }
    }

    /**
     * Gets the webview content for Workflow Studio.
     * @private
     */
    private getWebviewContent = async () => {
        if (!this.webviewHtml) {
            await this.fetchWebviewHtml()
        }
        let htmlFileSplit = this.webviewHtml.split('<head>')

        // Set asset source to CDN
        const source = isLocalDev ? localhost : cdn
        const baseTag = `<base href='${source}'/>`

        // Set locale, dark mode
        const locale = vscode.env.language
        const localeTag = `<meta name='locale' content='${locale}'>`
        const theme = vscode.window.activeColorTheme.kind
        const isDarkMode = theme === vscode.ColorThemeKind.Dark || theme === vscode.ColorThemeKind.HighContrast
        const darkModeTag = `<meta name='dark-mode' content='${isDarkMode}'>`
        let html = `${htmlFileSplit[0]} <head> ${baseTag} ${localeTag} ${darkModeTag} ${htmlFileSplit[1]}`

        const nonce = getRandomString()
        htmlFileSplit = html.split("script-src 'self'")

        html = `${htmlFileSplit[0]} script-src 'self' 'nonce-${nonce}' ${isLocalDev && localhost} ${htmlFileSplit[1]}`
        htmlFileSplit = html.split('<body>')
        const script = await fs.readFileAsString(
            vscode.Uri.joinPath(this.extensionContext.extensionUri, 'resources', 'js', 'vsCodeExtensionInterface.js')
        )

        return `${htmlFileSplit[0]} <body> <script nonce='${nonce}'>${script}</script> ${htmlFileSplit[1]}`
    }

    /**
     * Called when the custom editor is opened.
     * @param document:  The document to be displayed in the editor.
     * @param webviewPanel: The webview panel that the editor should be displayed in.
     * @param _token: A cancellation token that can be used to cancel the editor.
     * @returns A promise that resolves when the editor is resolved.
     */
    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        await telemetry.stepfunctions_openWorkflowStudio.run(async () => {
            if (!this.webviewHtml) {
                await this.fetchWebviewHtml()
            }

            if (clientId === '') {
                clientId = getClientId(globals.globalState)
            }
            // Attempt to retrieve existing visualization if it exists.
            const existingVisualization = this.managedVisualizations.get(document.uri.fsPath)

            if (existingVisualization) {
                existingVisualization.showPanel()
            } else {
                // Existing visualization does not exist, construct new visualization
                try {
                    const fileId = getStringHash(`${document.uri.fsPath}${clientId}`)
                    const newVisualization = new WorkflowStudioEditor(
                        document,
                        webviewPanel,
                        this.extensionContext,
                        fileId,
                        this.getWebviewContent
                    )
                    this.handleNewVisualization(document.uri.fsPath, newVisualization)
                } catch (err) {
                    throw new ToolkitError((err as Error).message, { code: 'OpenWorkflowStudioFailed' })
                }
            }
        })
    }

    protected handleNewVisualization(key: string, visualization: WorkflowStudioEditor): void {
        this.managedVisualizations.set(key, visualization)

        const visualizationDisposable = visualization.onVisualizationDisposeEvent(() => {
            this.managedVisualizations.delete(key)
        })
        this.extensionContext.subscriptions.push(visualizationDisposable)
    }
}
