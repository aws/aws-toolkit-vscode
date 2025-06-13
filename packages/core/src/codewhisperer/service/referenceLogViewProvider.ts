/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LicenseUtil } from '../util/licenseUtil'
import * as CodeWhispererConstants from '../models/constants'
import { CodeWhispererSettings } from '../util/codewhispererSettings'
import globals from '../../shared/extensionGlobals'
import { AuthUtil } from '../util/authUtil'
import { session } from '../util/codeWhispererSession'
import CodeWhispererClient from '../client/codewhispererclient'
import CodeWhispererUserClient from '../client/codewhispereruserclient'
import { InlineCompletionItemWithReferences } from '@aws/language-server-runtimes-types'

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
        this._view.webview.onDidReceiveMessage(async (data) => {
            await vscode.commands.executeCommand('aws.amazonq.configure', 'codewhisperer')
        })
    }

    public update() {
        if (this._view) {
            const showPrompt = CodeWhispererSettings.instance.isSuggestionsWithCodeReferencesEnabled()
            this._view.webview.html = this.getHtml(this._view.webview, showPrompt)
        }
    }

    public static getReferenceLog(recommendation: string, references: Reference[], editor: vscode.TextEditor): string {
        const filePath = editor.document.uri.path
        const time = new Date().toLocaleString()
        let text = ``
        for (const reference of references) {
            const standardReference = toStandardReference(reference)
            if (
                standardReference.position === undefined ||
                standardReference.position.start === undefined ||
                standardReference.position.end === undefined
            ) {
                continue
            }
            const { start, end } = standardReference.position
            const code = recommendation.substring(start, end)
            const firstCharLineNumber = editor.document.positionAt(session.startCursorOffset + start).line + 1
            const lastCharLineNumber = editor.document.positionAt(session.startCursorOffset + end - 1).line + 1
            let lineInfo = ``
            if (firstCharLineNumber === lastCharLineNumber) {
                lineInfo = `(line at ${firstCharLineNumber})`
            } else {
                lineInfo = `(lines from ${firstCharLineNumber} to ${lastCharLineNumber})`
            }
            if (text !== '') {
                text += `And `
            }

            let license = `<a href=${LicenseUtil.getLicenseHtml(standardReference.licenseName)}>${standardReference.licenseName}</a>`
            let repository = standardReference.repository?.length ? standardReference.repository : 'unknown'
            if (standardReference.url?.length) {
                repository = `<a href=${standardReference.url}>${standardReference.repository}</a>`
                license = `<b><i>${standardReference.licenseName || 'unknown'}</i></b>`
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
            if (AuthUtil.instance.isIdcConnection()) {
                prompt = CodeWhispererConstants.referenceLogPromptTextEnterpriseSSO
            } else {
                prompt = CodeWhispererConstants.referenceLogPromptText
            }
        }

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
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

/**
 * Reference log needs to support references directly from CW, as well as those from Flare. These references have different shapes, so we standarize them here.
 */
type GetInnerType<T> = T extends (infer U)[] ? U : never
type Reference =
    | CodeWhispererClient.Reference
    | CodeWhispererUserClient.Reference
    | GetInnerType<InlineCompletionItemWithReferences['references']>

type StandardizedReference = {
    licenseName?: string
    position?: {
        start?: number
        end?: number
    }
    repository?: string
    url?: string
}

/**
 * Convert a general reference to the standardized format expected by the reference log.
 * @param ref
 * @returns
 */
function toStandardReference(ref: Reference): StandardizedReference {
    const isCWReference = (ref: any) => ref.recommendationContentSpan !== undefined

    if (isCWReference(ref)) {
        const castRef = ref as CodeWhispererClient.Reference
        return {
            licenseName: castRef.licenseName!,
            position: { start: castRef.recommendationContentSpan?.start, end: castRef.recommendationContentSpan?.end },
            repository: castRef.repository,
            url: castRef.url,
        }
    }
    const castRef = ref as GetInnerType<InlineCompletionItemWithReferences['references']>
    return {
        licenseName: castRef.licenseName,
        position: { start: castRef.position?.startCharacter, end: castRef.position?.endCharacter },
        repository: castRef.referenceName,
        url: castRef.referenceUrl,
    }
}
