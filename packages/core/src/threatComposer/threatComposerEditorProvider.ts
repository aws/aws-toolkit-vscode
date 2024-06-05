/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { fsCommon } from '../srcShared/fs'
import request from '../common/request'
import { getLogger } from '../shared/logger'
import { ThreatComposerEditor } from './threatComposerEditor'
import { ToolkitError } from '../shared/errors'
import { telemetry } from '../shared/telemetry/telemetry'
import { getClientId } from '../shared/telemetry/util'
import { getRandomString, getStringHash } from '../shared/utilities/textUtilities'
import globals from '../shared/extensionGlobals'

const localize = nls.loadMessageBundle()

// Change this to true for local dev
const isLocalDev = false
const localhost = 'http://127.0.0.1:3000'
const cdn = 'https://ide-toolkits.threat-composer.aws.dev'
let clientId = ''

/**
 * Provider for ThreatComposer editors.
 *
 * ThreatComposer editor is used for `.tc.json` files, which are just json files.
 * To get started, run this extension and open an empty `.tc.json` file in VS Code.
 */
export class ThreatComposerEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = 'threatComposer.tc.json'

    /**
     * Registers a new custom editor provider for `.tc.json` files.
     * @remarks This should only be called once per extension.
     * @param context The extension context
     */
    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new ThreatComposerEditorProvider(context)
        return vscode.window.registerCustomEditorProvider(ThreatComposerEditorProvider.viewType, provider, {
            webviewOptions: {
                enableFindWidget: true,
                retainContextWhenHidden: true, // Set to 'false' to re-render on tab switch
            },
        })
    }

    protected readonly name: string = 'ThreatComposerManager'
    protected readonly managedVisualizations = new Map<string, ThreatComposerEditor>()
    protected extensionContext: vscode.ExtensionContext
    protected webviewHtml?: string
    protected readonly logger = getLogger()

    constructor(context: vscode.ExtensionContext) {
        this.extensionContext = context
        void this.fetchWebviewHtml()
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
     * Gets the webview content for the Threat Composer Editor.
     * @private
     */
    private getWebviewContent = async () => {
        if (!this.webviewHtml) {
            void this.fetchWebviewHtml()
            return ''
        }
        let htmlFileSplit = this.webviewHtml.split('<head>')

        // Set asset source to CDN
        const source = isLocalDev ? localhost : cdn
        const baseTag = `<base href='${source}'/>`

        // Set dark mode, locale, and feature flags
        const locale = vscode.env.language
        const localeTag = `<meta name='locale' content='${locale}'>`
        const theme = vscode.window.activeColorTheme.kind
        const isDarkMode = theme === vscode.ColorThemeKind.Dark || theme === vscode.ColorThemeKind.HighContrast
        const darkModeTag = `<meta name='dark-mode' content='${isDarkMode}'>`
        let html = `${htmlFileSplit[0]} <head> ${baseTag}' ${localeTag} ${darkModeTag} ${htmlFileSplit[1]}`

        const nonce = getRandomString()
        htmlFileSplit = html.split("script-src 'self'")

        let localDevURL = ''
        if (isLocalDev) {
            localDevURL = ` ${localhost}`
        }

        html = `${htmlFileSplit[0]} script-src 'self' 'nonce-${nonce}' ${localDevURL} ${htmlFileSplit[1]}`

        htmlFileSplit = html.split('<body>')
        const script = await fsCommon.readFileAsString(
            vscode.Uri.joinPath(this.extensionContext.extensionUri, 'resources', 'js', 'vsCodeExtensionInterface.js')
        )

        return `${htmlFileSplit[0]} <body> <script nonce='${nonce}'>${script}</script> ${htmlFileSplit[1]}`
    }

    /**
     * Called when our custom editor is opened.
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
        const threatComposerSettings = vscode.workspace.getConfiguration('aws').threatComposer

        if (threatComposerSettings.defaultEditor) {
            await telemetry.threatComposer_opened.run(async span => {
                if (clientId === '') {
                    clientId = await getClientId(globals.context.globalState)
                }
                // Attempt to retrieve existing visualization if it exists.
                const existingVisualization = this.getExistingVisualization(document.uri.fsPath)
                if (existingVisualization) {
                    existingVisualization.showPanel()
                } else {
                    // Existing visualization does not exist, construct new visualization
                    try {
                        const fileId = getStringHash(document.uri.fsPath + clientId)
                        const newVisualization = new ThreatComposerEditor(
                            document,
                            webviewPanel,
                            this.extensionContext,
                            fileId,
                            this.getWebviewContent
                        )
                        this.handleNewVisualization(document.uri.fsPath, newVisualization)
                    } catch (err) {
                        this.handleErr(err as Error)
                        throw new ToolkitError((err as Error).message, { code: 'Failed to Open Threat Composer' })
                    }
                }
            })
        } else {
            await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default')
            webviewPanel.dispose()
        }
    }

    protected handleErr(err: Error): void {
        void vscode.window.showInformationMessage(
            localize(
                'AWS.threatComposer.visualisation.errors.rendering',
                'There was an error rendering Threat Composer, check logs for details.'
            )
        )
        this.logger.error(`${this.name}: Unable to open in ThreatComposer view: ${err}`)
    }

    protected handleNewVisualization(key: string, visualization: ThreatComposerEditor): void {
        this.managedVisualizations.set(key, visualization)

        const visualizationDisposable = visualization.onVisualizationDisposeEvent(() => {
            this.managedVisualizations.delete(key)
        })
        this.pushToExtensionContextSubscriptions(visualizationDisposable)
    }

    protected pushToExtensionContextSubscriptions(visualizationDisposable: vscode.Disposable): void {
        this.extensionContext.subscriptions.push(visualizationDisposable)
    }

    protected getExistingVisualization(key: string): ThreatComposerEditor | undefined {
        return this.managedVisualizations.get(key)
    }
}
