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
// import { getStringHash } from '../../shared/utilities/textUtilities'
import { ToolkitError } from '../../shared/errors'
import { getTabSizeSetting } from '../../shared/utilities/editorUtilities'
import { i18n } from '../../shared/i18n-helper'
import { WorkflowMode } from '../workflowStudio/types'

const isLocalDev = true
const localhost = 'http://127.0.0.1:3002'
const cdn = 'https://d5t62uwepi9lu.cloudfront.net'
let clientId = ''

/**
 * Provider for Execution Details panels.
 *
 * Execution Details displays information about state machine executions in a WebView panel.
 */
export class ExecutionDetailProvider {
    public static readonly viewType = 'stepfunctions.executionDetails'

    /**
     * Opens execution details in a WebView panel.
     * @param executionArn The ARN of the execution to display details for
     * @param params Optional parameters to customize the WebView panel
     */
    public static async openExecutionDetails(
        executionArn: string,
        params?: vscode.WebviewPanelOptions & vscode.WebviewOptions
    ): Promise<void> {
        await telemetry.stepfunctions_openWorkflowStudio.run(async () => {
            // Create and show the webview panel
            const panel = vscode.window.createWebviewPanel(
                ExecutionDetailProvider.viewType,
                `Execution: ${executionArn.split(':').pop() || executionArn}`,
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    ...params,
                }
            )

            // Create the provider and initialize the panel
            const provider = new ExecutionDetailProvider()
            await provider.initializePanel(panel, executionArn)
        })
    }

    /**
     * Registers the command to open execution details.
     * @remarks This should only be called once per extension.
     */
    public static register(): vscode.Disposable {
        return vscode.commands.registerCommand(
            'aws.stepFunctions.viewExecutionDetails',
            async (executionArn: string) => {
                await ExecutionDetailProvider.openExecutionDetails(executionArn)
            }
        )
    }

    protected webviewHtml: string
    protected readonly logger = getLogger()

    constructor() {
        this.webviewHtml = ''
    }

    /**
     * Fetches the webview HTML from the CDN or local server.
     * @private
     */
    private async fetchWebviewHtml(): Promise<void> {
        const source = isLocalDev ? localhost : cdn
        const response = await request.fetch('GET', `${source}/index.html`).response
        this.webviewHtml = await response.text()
    }

    /**
     * Gets the webview content for Execution Details.
     * @private
     */
    // executionArn: string
    private getWebviewContent = async (): Promise<string> => {
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

        // Set component type to ExecutionDetails
        const componentTypeTag = `<meta name="component-type" content="ExecutionDetails" />`

        // Add execution ARN to load the specific execution
        // const executionArnTag = `<meta name="execution-arn" content="${executionArn}" />`

        // Set to read-only mode as this is just displaying execution details
        const modeTag = `<meta name="workflow-mode" content="${WorkflowMode.Readonly}" />`
        // const modeTag = `<meta name="workflow-mode" content="${mode}" />`

        return `${htmlFileSplit[0]} <head> ${baseTag} ${localeTag} ${darkModeTag} ${tabSizeTag} ${modeTag} ${componentTypeTag} ${htmlFileSplit[1]}`
    }

    /**
     * Initializes a WebView panel with execution details.
     * @param panel The WebView panel to initialize
     * @param executionArn The ARN of the execution to display
     */
    public async initializePanel(panel: vscode.WebviewPanel, executionArn: string): Promise<void> {
        try {
            if (!this.webviewHtml) {
                await this.fetchWebviewHtml()
            }

            if (clientId === '') {
                clientId = getClientId(globals.globalState)
            }

            // Set up the content
            // panel.webview.html = await this.getWebviewContent(executionArn)
            panel.webview.html = await this.getWebviewContent()

            // Handle messages from the webview
            panel.webview.onDidReceiveMessage(async (message) => {
                this.logger.debug('Received message from execution details webview: %O', message)
                // Add message handlers as needed
            })
        } catch (err) {
            void vscode.window.showErrorMessage(i18n('AWS.stepFunctions.executionDetails.failed'))
            throw ToolkitError.chain(err, 'Could not open Execution Details', { code: 'OpenExecutionDetailsFailed' })
        }
    }
}
