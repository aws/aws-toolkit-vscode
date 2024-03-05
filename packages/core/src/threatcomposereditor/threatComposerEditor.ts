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
import { handleMessage } from './handleMessage'
import { addFileWatchMessageHandler, broadcastFileChange } from './messageHandlers/addFileWatchMessageHandler'
import { addThemeWatchMessageHandler } from './messageHandlers/addThemeWatchMessageHandler'
import * as path from 'path'
import { FileWatchInfo } from './types'

const localize = nls.loadMessageBundle()

// let writeToFileInProgress = false;

// const localize = nls.loadMessageBundle()

// Change this to true for local dev
const isLocalDev = true
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
    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new ThreatComposerEditorProvider(context)
        const providerRegistration = vscode.window.registerCustomEditorProvider(
            ThreatComposerEditorProvider.viewType,
            provider,
            {
                webviewOptions: { retainContextWhenHidden: false }, // Comment this line if you wish to re-render on tab switch
            }
        )
        return providerRegistration
    }

    private static readonly viewType = 'threatComposer.tc.json'

    protected readonly name: string = 'ThreatComposerManager'
    protected extensionContext: vscode.ExtensionContext
    protected webviewHtml?: string
    protected readonly logger = getLogger()
    protected readonly disposables: vscode.Disposable[] = []
    protected isPanelDisposed = false
    public fileWatches: Record<string, FileWatchInfo>

    constructor(private readonly context: vscode.ExtensionContext) {
        this.extensionContext = context
        this.fileWatches = {}
        void this.fetchWebviewHtml()
    }

    /**
     * Called when our custom editor is opened.
     */
    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        const documentUri = document.uri
        const workSpacePath = path.dirname(documentUri.fsPath)
        const defaultTemplatePath = documentUri.fsPath
        const defaultTemplateName = path.basename(defaultTemplatePath)

        // Setup initial content for the webview
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri],
        }

        webviewPanel.webview.html = this.getWebviewContent()
        webviewPanel.title = localize(
            'AWS.threatComposer.page.title',
            '{0} (Threat Composer)',
            path.basename(documentUri.fsPath)
        )

        if (vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light) {
            webviewPanel.iconPath = vscode.Uri.file(
                this.extensionContext.asAbsolutePath(
                    path.join('resources', 'icons', 'aws', 'applicationcomposer', 'icon.svg')
                )
            )
        } else {
            webviewPanel.iconPath = vscode.Uri.file(
                this.extensionContext.asAbsolutePath(
                    path.join('resources', 'icons', 'aws', 'applicationcomposer', 'icon-dark.svg')
                )
            )
        }

        // Hook up event handlers so that we can synchronize the webview with the text document.
        //
        // The text document acts as our model, so we have to sync change in the document to our
        // editor and sync changes in the editor back to the document.
        //
        // Remember that a single text document can also be shared between multiple custom
        // editors (this happens for example when you split a custom editor)

        addFileWatchMessageHandler({
            panel: webviewPanel,
            textDocument: document,
            disposables: this.disposables,
            workSpacePath: workSpacePath,
            defaultTemplatePath: defaultTemplatePath,
            defaultTemplateName: defaultTemplateName,
            fileWatches: this.fileWatches,
        })

        addThemeWatchMessageHandler({
            panel: webviewPanel,
            textDocument: document,
            disposables: this.disposables,
            workSpacePath: workSpacePath,
            defaultTemplatePath: defaultTemplatePath,
            defaultTemplateName: defaultTemplateName,
            fileWatches: this.fileWatches,
        })

        // When the panel is closed, dispose of any disposables/remove subscriptions
        const disposePanel = () => {
            // if (this.isPanelDisposed) {
            //     return
            // }
            // this.isPanelDisposed = true
            this.disposables.forEach(disposable => {
                disposable.dispose()
            })
        }

        this.disposables.push(
            webviewPanel.onDidDispose(() => {
                disposePanel()
            })
        )

        // Handle messages from the webview
        this.disposables.push(
            webviewPanel.webview.onDidReceiveMessage(message =>
                handleMessage(message, {
                    panel: webviewPanel,
                    textDocument: document,
                    disposables: this.disposables,
                    workSpacePath: workSpacePath,
                    defaultTemplatePath: defaultTemplatePath,
                    defaultTemplateName: defaultTemplateName,
                    fileWatches: this.fileWatches,
                })
            )
        )

        const fileContents = document.getText()
        this.fileWatches[defaultTemplatePath] = { fileContents: fileContents }
        void broadcastFileChange(defaultTemplateName, fileContents, webviewPanel)
    }

    private async fetchWebviewHtml() {
        const source = isLocalDev ? localhost : cdn
        const response = await request.fetch('GET', `${source}/index.html`).response
        this.webviewHtml = await response.text()
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
}
