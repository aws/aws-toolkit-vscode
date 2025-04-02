/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import request from '../../shared/request'
import { getClientId } from '../../shared/telemetry/util'
import { telemetry } from '../../shared/telemetry/telemetry'
import globals from '../../shared/extensionGlobals'
import { getStringHash } from '../../shared/utilities/textUtilities'
import { ToolkitError } from '../../shared/errors'
import { getTabSizeSetting } from '../../shared/utilities/editorUtilities'
import { WorkflowStudioEditor } from './workflowStudioEditor'
import { i18n } from '../../shared/i18n-helper'
import { isInvalidJsonFile, isInvalidYamlFile } from '../utils'
import { WorkflowMode } from './types'

const isLocalDev = false
const localhost = 'http://127.0.0.1:3002'
const cdn = 'https://d5t62uwepi9lu.cloudfront.net'
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
     * Opens a file in the Workflow Studio editor, after validating the document.
     * @param uri The URI of the document to open in the Workflow Studio editor.
     * @param params Optional parameters to customize the WebView panel.
     */
    public static async openWithWorkflowStudio(
        uri: vscode.Uri,
        params?: Parameters<typeof vscode.window.createWebviewPanel>[2]
    ) {
        const document = await vscode.workspace.openTextDocument(uri)
        await telemetry.stepfunctions_openWorkflowStudio.run(async () => {
            await this.validateAndThrowIfInvalid(document)
            await vscode.commands.executeCommand('vscode.openWith', uri, WorkflowStudioEditorProvider.viewType, params)
        })
    }

    /**
     * Validates the document to ensure it is either valid JSON or YAML.
     * If the document is invalid, a warning is shown (if specified) and an error is thrown to stop further execution.
     * @param document The document to validate.
     * @param alertOnError If true, shows a warning message when the document is invalid. Defaults to `false`.
     */
    private static async validateAndThrowIfInvalid(
        document: vscode.TextDocument,
        alertOnError?: boolean
    ): Promise<void> {
        const isInvalidJson = isInvalidJsonFile(document)
        const isInvalidYaml = isInvalidYamlFile(document)

        if (isInvalidJson || isInvalidYaml) {
            const language = isInvalidJson ? 'JSON' : 'YAML'
            const errorKey = isInvalidJson ? 'InvalidJSONContent' : 'InvalidYAMLContent'

            if (alertOnError) {
                void vscode.window.showErrorMessage(i18n(`AWS.stepFunctions.workflowStudio.actions.${errorKey}`))
            }

            throw ToolkitError.chain(
                `Invalid ${language} file`,
                `The Workflow Studio editor was not opened because the ${language} in the file is invalid`,
                { code: errorKey }
            )
        }
    }

    /**
     * Registers a new custom editor provider for asl files.
     * @remarks This should only be called once per extension.
     * @param context The extension context
     */
    public static register(): vscode.Disposable {
        const provider = new WorkflowStudioEditorProvider()
        return vscode.window.registerCustomEditorProvider(WorkflowStudioEditorProvider.viewType, provider, {
            webviewOptions: {
                enableFindWidget: true,
                retainContextWhenHidden: true, // Retain content when switching tabs
            },
        })
    }

    protected webviewHtml: string
    protected readonly managedVisualizations = new Map<string, WorkflowStudioEditor>()
    protected readonly logger = getLogger()

    constructor() {
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
            await visualization.refreshPanel()
        }
    }

    /**
     * Gets the webview content for Workflow Studio.
     * @private
     */
    private getWebviewContent = async (mode: WorkflowMode) => {
        const htmlFileSplit = this.webviewHtml.split('<head>')

        // Set asset source to CDN
        const source = isLocalDev ? localhost : cdn
        const baseTag = `<base href='${source}'/>`

        // Set locale, dark mode
        const locale = vscode.env.language
        const localeTag = `<meta name='locale' content='${locale}'>`
        const theme = vscode.window.activeColorTheme.kind
        const isDarkMode = theme === vscode.ColorThemeKind.Dark || theme === vscode.ColorThemeKind.HighContrast
        const tabSizeTag = `<meta name='tab-size' content='${getTabSizeSetting()}'>`
        const darkModeTag = `<meta name='dark-mode' content='${isDarkMode}'>`

        const modeTag = `<meta name="workflow-mode" content="${mode}" />`
        return `${htmlFileSplit[0]} <head> ${baseTag} ${localeTag} ${darkModeTag} ${tabSizeTag} ${modeTag} ${htmlFileSplit[1]}`
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
        const uriSearchParams = new URLSearchParams(document.uri.query)
        const stateMachineName = uriSearchParams.get('statemachineName') || ''
        const workflowMode = (uriSearchParams.get('workflowMode') as WorkflowMode) || WorkflowMode.Editable
        await telemetry.stepfunctions_openWorkflowStudio.run(async () => {
            const reopenWithDefaultEditor = async () => {
                await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default')
                webviewPanel.dispose()
            }

            try {
                await WorkflowStudioEditorProvider.validateAndThrowIfInvalid(document, true)
            } catch (e) {
                // If the document is invalid, reopen it with the default editor and re-throw the error
                await reopenWithDefaultEditor()
                throw e
            }

            if (!this.webviewHtml) {
                try {
                    await this.fetchWebviewHtml()
                } catch (e) {
                    await reopenWithDefaultEditor()

                    void vscode.window.showWarningMessage(
                        i18n('AWS.stepFunctions.workflowStudio.actions.webviewFetchFailed')
                    )
                    throw ToolkitError.chain(
                        'Failed to fetch editor content',
                        'Could not retrieve content for the Workflow Studio editor',
                        {
                            code: 'webviewFetchFailed',
                        }
                    )
                }
            }

            if (clientId === '') {
                clientId = getClientId(globals.globalState)
            }

            const existingVisualization = this.managedVisualizations.get(document.uri.fsPath)
            if (existingVisualization) {
                // Prevent opening multiple custom editors for a single file
                await reopenWithDefaultEditor()
            } else {
                // Construct new visualization
                try {
                    const fileId = getStringHash(`${document.uri.fsPath}${clientId}`)
                    const newVisualization = new WorkflowStudioEditor(
                        document,
                        webviewPanel,
                        fileId,
                        () => this.getWebviewContent(workflowMode),
                        workflowMode,
                        stateMachineName
                    )
                    this.handleNewVisualization(document.uri.fsPath, newVisualization)
                } catch (err) {
                    throw ToolkitError.chain(err, 'Could not open Workflow Studio editor', {
                        code: 'OpenWorkflowStudioFailed',
                    })
                }
            }
        })
    }

    protected handleNewVisualization(key: string, visualization: WorkflowStudioEditor): void {
        this.managedVisualizations.set(key, visualization)

        const visualizationDisposable = visualization.onVisualizationDisposeEvent(() => {
            this.managedVisualizations.delete(key)
        })
        globals.context.subscriptions.push(visualizationDisposable)
    }
}
