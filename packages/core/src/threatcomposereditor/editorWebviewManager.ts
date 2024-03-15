/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getNonce } from './util'
import * as nls from 'vscode-nls'
import * as fs from 'fs'
import request from '../common/request'
import { getLogger } from '../shared/logger'
import { ThreatComposer } from './editorWebview'
import { ToolkitError } from '../shared/errors'
import { telemetry } from '../shared/telemetry/telemetry'

const localize = nls.loadMessageBundle()

// let writeToFileInProgress = false;

// const localize = nls.loadMessageBundle()

// Change this to true for local dev
const isLocalDev = false
const localhost = 'http://127.0.0.1:3000'
const cdn = 'https://ide-toolkits.threat-composer.aws.dev'

/**
 * Provider for ThreatComposer editors.
 *
 * ThreatComposer editor is used for `.tc.json` files, which are just json files.
 * To get started, run this extension and open an empty `.tc.json` file in VS Code.
 *
 */
export class ThreatComposerEditorProvider implements vscode.CustomTextEditorProvider {
    private static readonly viewType = 'threatComposer.tc.json'
    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new ThreatComposerEditorProvider(context)
        const providerRegistration = vscode.window.registerCustomEditorProvider(
            ThreatComposerEditorProvider.viewType,
            provider,
            {
                webviewOptions: { retainContextWhenHidden: false }, // Set to false to re-render on tab switch
            }
        )
        return providerRegistration
    }

    protected readonly name: string = 'ThreatComposerManager'
    protected readonly managedVisualizations = new Map<string, ThreatComposer>()
    protected extensionContext: vscode.ExtensionContext
    protected webviewHtml?: string
    protected readonly logger = getLogger()

    constructor(context: vscode.ExtensionContext) {
        this.extensionContext = context
        void this.fetchWebviewHtml()
    }

    private async fetchWebviewHtml() {
        const source = isLocalDev ? localhost : cdn
        const response = await request.fetch('GET', `${source}/index.html`).response
        this.webviewHtml = await response.text()

        for (const visualization of this.managedVisualizations.values()) {
            await visualization.refreshPanel(this.extensionContext)
        }
    }

    private getWebviewContent = () => {
        if (!this.webviewHtml) {
            void this.fetchWebviewHtml()
            return ''
        }
        let htmlFileSplit = this.webviewHtml.split('<head>')

        // Set asset source to CDN
        const source = isLocalDev ? localhost : cdn
        const baseTag = '<base href="' + source + '/" >'

        // Set dark mode, locale, and feature flags
        const locale = vscode.env.language
        const localeTag = `<meta name="locale" content="${locale}">`
        const theme = vscode.window.activeColorTheme.kind
        const isDarkMode = theme === vscode.ColorThemeKind.Dark || theme === vscode.ColorThemeKind.HighContrast
        const darkModeTag = `<meta name="dark-mode" content="${isDarkMode}">`
        let html = htmlFileSplit[0] + '<head>' + baseTag + localeTag + darkModeTag + htmlFileSplit[1]

        const nonce = getNonce()
        htmlFileSplit = html.split("script-src 'self'")

        let localDevURL = ''
        if (isLocalDev) {
            localDevURL = ' ' + localhost + ''
        }

        html = htmlFileSplit[0] + "script-src 'self' 'nonce-" + nonce + "'" + localDevURL + htmlFileSplit[1]

        htmlFileSplit = html.split('<body>')

        const script = fs.readFileSync(
            vscode.Uri.joinPath(
                this.extensionContext.extensionUri,
                'dist',
                'src',
                'threatcomposereditor',
                'VSCodeExtensionInterface.js'
            ).fsPath,
            'utf8'
        )
        const scriptTag = `<script nonce="${nonce}">${script}</script>`

        return htmlFileSplit[0] + '<body>' + scriptTag + htmlFileSplit[1]
    }

    /**
     * Called when our custom editor is opened.
     */
    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        await telemetry.threatcomposer_opened.run(async span => {
            // Attempt to retrieve existing visualization if it exists.
            const existingVisualization = this.getExistingVisualization(document.uri.fsPath)
            if (existingVisualization) {
                existingVisualization.showPanel()
            }

            // Existing visualization does not exist, construct new visualization
            try {
                const newVisualization = new ThreatComposer(
                    document,
                    webviewPanel,
                    this.extensionContext,
                    this.getWebviewContent
                )
                this.handleNewVisualization(document.uri.fsPath, newVisualization)
            } catch (err) {
                this.handleErr(err as Error)
                throw new ToolkitError((err as Error).message, { code: 'Failed to Open Threat Composer' })
            }
        })
    }

    protected handleErr(err: Error): void {
        void vscode.window.showInformationMessage(
            localize(
                'AWS.applicationComposer.visualisation.errors.rendering',
                'There was an error rendering Application Composer, check logs for details.'
            )
        )
        this.logger.error(`${this.name}: Unable to show App Composer webview: ${err}`)
    }

    protected handleNewVisualization(key: string, visualization: ThreatComposer): void {
        this.managedVisualizations.set(key, visualization)

        const visualizationDisposable = visualization.onVisualizationDisposeEvent(() => {
            this.managedVisualizations.delete(key)
        })
        this.pushToExtensionContextSubscriptions(visualizationDisposable)
    }

    protected pushToExtensionContextSubscriptions(visualizationDisposable: vscode.Disposable): void {
        this.extensionContext.subscriptions.push(visualizationDisposable)
    }

    protected getExistingVisualization(key: string): ThreatComposer | undefined {
        return this.managedVisualizations.get(key)
    }
}
