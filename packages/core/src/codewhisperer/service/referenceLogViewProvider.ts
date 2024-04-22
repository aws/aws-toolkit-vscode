/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { References } from '../client/codewhisperer'
import { LicenseUtil } from '../util/licenseUtil'
import * as CodeWhispererConstants from '../models/constants'
import { CodeWhispererSettings } from '../util/codewhispererSettings'
import globals from '../../shared/extensionGlobals'
import { isCloud9 } from '../../shared/extensionUtilities'
import { AuthUtil } from '../util/authUtil'
import { session } from '../util/codeWhispererSession'

export class ReferenceLogViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'aws.codeWhisperer.referenceLog'
    private _view?: vscode.WebviewView
    private _referenceLogs: string[] = []
    private _extensionUri: vscode.Uri = globals.context.extensionUri
    constructor() {}
    static #instance: ReferenceLogViewProvider

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext<unknown>,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        this._view = webviewView

        this._view.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        }
        this._view.webview.html = this.getHtml(
            webviewView.webview,
            CodeWhispererSettings.instance.isSuggestionsWithCodeReferencesEnabled()
        )
        this._view.webview.onDidReceiveMessage(async data => {
            await vscode.commands.executeCommand('aws.amazonq.configure', 'codewhisperer')
        })
    }

    public update() {
        if (this._view) {
            const showPrompt = CodeWhispererSettings.instance.isSuggestionsWithCodeReferencesEnabled()
            this._view.webview.html = this.getHtml(this._view.webview, showPrompt)
        }
    }

    public static getReferenceLog(recommendation: string, references: References, editor: vscode.TextEditor): string {
        const filePath = editor.document.uri.path
        const time = new Date().toLocaleString()
        let text = ``
        for (const reference of references) {
            if (
                reference.recommendationContentSpan === undefined ||
                reference.recommendationContentSpan.start === undefined ||
                reference.recommendationContentSpan.end === undefined
            ) {
                continue
            }
            const code = recommendation.substring(
                reference.recommendationContentSpan.start,
                reference.recommendationContentSpan.end
            )
            const firstCharLineNumber =
                editor.document.positionAt(session.startCursorOffset + reference.recommendationContentSpan.start).line +
                1
            const lastCharLineNumber =
                editor.document.positionAt(session.startCursorOffset + reference.recommendationContentSpan.end - 1)
                    .line + 1
            let lineInfo = ``
            if (firstCharLineNumber === lastCharLineNumber) {
                lineInfo = `(line at ${firstCharLineNumber})`
            } else {
                lineInfo = `(lines from ${firstCharLineNumber} to ${lastCharLineNumber})`
            }
            if (text !== '') {
                text += `And `
            }

            let license = `<a href=${LicenseUtil.getLicenseHtml(reference.licenseName)}>${reference.licenseName}</a>`
            let repository = reference.repository?.length ? reference.repository : 'unknown'
            if (reference.url?.length) {
                repository = `<a href=${reference.url}>${reference.repository}</a>`
                license = `<b><i>${reference.licenseName || 'unknown'}</i></b>`
            }

            text +=
                CodeWhispererConstants.referenceLogText(
                    `<br><code>${code}</code><br>`,
                    license,
                    repository,
                    filePath,
                    lineInfo
                ) + ' <br>'
        }
        if (text === ``) {
            return ''
        }
        return `[${time}] Accepted recommendation ${text}<br>`
    }

    public addReferenceLog(referenceLog: string) {
        if (referenceLog !== '') {
            this._referenceLogs.push(referenceLog)
        }
        this.update()
    }
    private getHtml(webview: vscode.Webview, showPrompt: boolean): string {
        const styleVSCodeUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'src', 'codewhisperer', 'views/css/codewhispererReferenceLog.css')
        )

        let prompt = ''
        if (showPrompt) {
            if (AuthUtil.instance.isEnterpriseSsoInUse()) {
                prompt = CodeWhispererConstants.referenceLogPromptTextEnterpriseSSO
            } else {
                prompt = CodeWhispererConstants.referenceLogPromptText
            }
        }

        let csp = ''
        if (isCloud9()) {
            csp = `<meta
            http-equiv="Content-Security-Policy"
            content=
                "default-src 'none';
                img-src https: data:;
                script-src 'self' 'unsafe-inline';
                style-src 'self' 'unsafe-inline' ${webview.cspSource};
                font-src 'self' data:;"
            >`
        }
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
				${csp}
                <link rel="stylesheet" href="${styleVSCodeUri}">
            </head>
            <body>
                <p>${prompt} </p>
                <p> ${this._referenceLogs.join('')} </p>
                <script>
                const vscode = acquireVsCodeApi();
                function openSettings() {
                    vscode.postMessage('aws.explorer.focus')
                }
                </script>
            </body>
            </html>`
    }
}
