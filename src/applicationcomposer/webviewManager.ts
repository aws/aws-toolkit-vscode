/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import fetch from '../common/request'
import { ApplicationComposer } from './composerWebview'
import { getLogger } from '../shared/logger'

const localize = nls.loadMessageBundle()

// TODO turn this into a flag to make local dev easier
// Change this to true for local dev
const isLocalDev = false
const localhost = 'http://127.0.0.1:3000'
const cdn = 'https://ide-toolkits.app-composer.aws.dev'

const enabledFeatures = ['ide-only', 'anything-resource', 'sfnV2', 'starling']

export class ApplicationComposerManager {
    protected readonly name: string = 'ApplicationComposerManager'

    protected readonly managedVisualizations = new Map<string, ApplicationComposer>()
    protected extensionContext: vscode.ExtensionContext
    protected webviewHtml?: string
    protected readonly logger = getLogger()

    public constructor(extensionContext: vscode.ExtensionContext) {
        this.extensionContext = extensionContext
        void this.fetchWebviewHtml()
    }

    private async fetchWebviewHtml() {
        const source = isLocalDev ? localhost : cdn
        const response = await fetch('GET', `${source}/index.html`).response
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
        const htmlFileSplit = this.webviewHtml.split('<head>')

        // Set asset source to CDN
        const source = isLocalDev ? localhost : cdn
        const baseTag = '<base href="' + source + '/" >'

        // Set dark mode, locale, and feature flags
        const locale = vscode.env.language
        const localeTag = `<meta name="locale" content="${locale}">`
        const theme = vscode.window.activeColorTheme.kind
        const isDarkMode = theme === vscode.ColorThemeKind.Dark || theme === vscode.ColorThemeKind.HighContrast
        const darkModeTag = `<meta name="dark-mode" content="${isDarkMode}">`
        const featuresTag = `<meta name="feature-flags" content='${JSON.stringify(enabledFeatures)}'>`

        return htmlFileSplit[0] + '<head>' + baseTag + localeTag + darkModeTag + featuresTag + htmlFileSplit[1]
    }

    public async visualizeTemplate(target: vscode.TextDocument | vscode.Uri): Promise<vscode.WebviewPanel | undefined> {
        const document = target instanceof vscode.Uri ? await vscode.workspace.openTextDocument(target) : target

        // Attempt to retrieve existing visualization if it exists.
        const existingVisualization = this.getExistingVisualization(document.uri.fsPath)
        if (existingVisualization) {
            existingVisualization.showPanel()

            return existingVisualization.getPanel()
        }

        // Existing visualization does not exist, construct new visualization
        try {
            const newVisualization = new ApplicationComposer(document, this.extensionContext, this.getWebviewContent)
            this.handleNewVisualization(document.uri.fsPath, newVisualization)

            return newVisualization.getPanel()
        } catch (err) {
            this.handleErr(err as Error)
        }
    }

    public async createTemplate(): Promise<vscode.WebviewPanel | undefined> {
        try {
            const document = await vscode.workspace.openTextDocument({
                language: 'yaml',
            })
            const newVisualization = new ApplicationComposer(document, this.extensionContext, this.getWebviewContent)
            this.handleNewVisualization(document.uri.fsPath, newVisualization)

            return newVisualization.getPanel()
        } catch (err) {
            this.handleErr(err as Error)
        }
    }

    protected getExistingVisualization(key: string): ApplicationComposer | undefined {
        return this.managedVisualizations.get(key)
    }

    protected handleErr(err: Error): void {
        void vscode.window.showInformationMessage(
            localize(
                'AWS.applicationComposer.visualisation.errors.rendering',
                'There was an error rendering Application Composer, check logs for details.'
            )
        )

        this.logger.debug(`${this.name}: Unable to setup webview panel.`)
        this.logger.error(`${this.name}: unexpected exception: %s`, err)
    }

    protected handleNewVisualization(key: string, visualization: ApplicationComposer): void {
        this.managedVisualizations.set(key, visualization)

        const visualizationDisposable = visualization.onVisualizationDisposeEvent(() => {
            this.managedVisualizations.delete(key)
        })
        this.pushToExtensionContextSubscriptions(visualizationDisposable)
    }

    protected pushToExtensionContextSubscriptions(visualizationDisposable: vscode.Disposable): void {
        this.extensionContext.subscriptions.push(visualizationDisposable)
    }
}
