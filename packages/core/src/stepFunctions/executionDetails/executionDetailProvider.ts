/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import request from '../../shared/request'
import { ToolkitError } from '../../shared/errors'
import { i18n } from '../../shared/i18n-helper'
import { ComponentType } from '../messageHandlers/types'
import { isLocalDev, localhost, cdn } from '../constants/webviewResources'
import { handleMessage } from './handleMessage'
import { ExecutionDetailsContext } from '../messageHandlers/types'
import { parseExecutionArnForStateMachine } from '../utils'

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
        startTime?: string,
        params?: vscode.WebviewPanelOptions & vscode.WebviewOptions
    ): Promise<void> {
        // Create and show the webview panel
        const panel = vscode.window.createWebviewPanel(
            ExecutionDetailProvider.viewType,
            `Execution: ${executionArn.split(':').pop() || executionArn}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                ...params,
            }
        )
        // Create the provider and initialize the panel
        const provider = new ExecutionDetailProvider()
        await provider.initializePanel(panel, executionArn, startTime)
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
    private getWebviewContent = async (executionArn: string, startTime?: string): Promise<string> => {
        const htmlFileSplit = this.webviewHtml.split('<head>')

        // Set asset source to CDN
        const source = isLocalDev ? localhost : cdn
        const baseTag = `<base href='${source}'/>`

        // Set locale, dark mode
        const locale = vscode.env.language
        const localeTag = `<meta name='locale' content='${locale}'>`
        const theme = vscode.window.activeColorTheme.kind
        const isDarkMode = theme === vscode.ColorThemeKind.Dark || theme === vscode.ColorThemeKind.HighContrast
        const darkModeTag = `<meta name='dark-mode' content='${isDarkMode}'>`

        // Set component type to ExecutionDetails
        const componentTypeTag = `<meta name="component-type" content="${ComponentType.ExecutionDetails}" />`
        const executionArnTag = `<meta name="execution-arn" content="${executionArn}" />`

        // Only include start time tag for express executions (when startTime is provided)
        const startTimeTag = startTime ? `<meta name="start-time" content="${startTime}" />` : ''

        const region = parseExecutionArnForStateMachine(executionArn)?.region
        const regionTag = `<meta name="region" content="${region}" />`

        return `${htmlFileSplit[0]} <head> ${baseTag} ${localeTag} ${darkModeTag} ${componentTypeTag} ${executionArnTag} ${startTimeTag} ${regionTag} ${htmlFileSplit[1]}`
    }

    /**
     * Initializes a WebView panel with execution details.
     * @param panel The WebView panel to initialize
     * @param executionArn The ARN of the execution to display
     * @param startTime Optional start time for the execution
     */
    public async initializePanel(panel: vscode.WebviewPanel, executionArn: string, startTime?: string): Promise<void> {
        try {
            if (!this.webviewHtml) {
                await this.fetchWebviewHtml()
            }

            // Set up the content
            panel.webview.html = await this.getWebviewContent(executionArn, startTime)
            const context: ExecutionDetailsContext = {
                panel,
                loaderNotification: undefined,
                executionArn,
                startTime,
            }

            // Handle messages from the webview
            panel.webview.onDidReceiveMessage(async (message) => {
                this.logger.debug('Received message from execution details webview: %O', message)
                await handleMessage(message, context)
            })
        } catch (err) {
            void vscode.window.showErrorMessage(i18n('AWS.stepFunctions.executionDetails.failed'))
            throw ToolkitError.chain(err, 'Could not open Execution Details', { code: 'OpenExecutionDetailsFailed' })
        }
    }
}
