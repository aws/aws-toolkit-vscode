/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../shared/extensionGlobals'
import { getNonce, md } from '../util/webviewUtil'
import { CodeScanIssue } from '../models/model'

export class SecurityIssuePanel {
    public static readonly viewType = 'aws.codeWhisperer.securityIssue'
    public static instance: SecurityIssuePanel | undefined
    private readonly _panel: vscode.WebviewPanel
    private _disposables: vscode.Disposable[] = []
    private _issue: CodeScanIssue | undefined

    constructor(panel: vscode.WebviewPanel) {
        this._panel = panel
        this._panel.onDidDispose(() => this.dispose(), undefined, this._disposables)
        this._panel.webview.html = this._getHtml()
        this._setWebviewMessageListener()
    }

    public static render() {
        if (SecurityIssuePanel.instance) {
            SecurityIssuePanel.instance._panel.reveal()
        } else {
            const panel = vscode.window.createWebviewPanel(
                this.viewType,
                'CodeWhisperer Security Issue',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    localResourceRoots: [globals.context.extensionUri],
                }
            )
            panel.iconPath = {
                light: vscode.Uri.joinPath(globals.context.extensionUri, 'resources/icons/vscode/light/shield.svg'),
                dark: vscode.Uri.joinPath(globals.context.extensionUri, 'resources/icons/vscode/dark/shield.svg'),
            }
            SecurityIssuePanel.instance = new SecurityIssuePanel(panel)
        }
    }

    public update(issue: CodeScanIssue) {
        this._issue = issue
        this._panel.webview.html = this._getHtml()
        this._panel.webview.postMessage({ command: 'cache', issue })
    }

    public dispose() {
        SecurityIssuePanel.instance = undefined
        this._panel.dispose()
        while (this._disposables.length) {
            const disposable = this._disposables.pop()
            if (disposable) {
                disposable.dispose()
            }
        }
    }

    public static revive(panel: vscode.WebviewPanel) {
        this.instance = new SecurityIssuePanel(panel)
    }

    private _getHtml() {
        const webviewUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(globals.context.extensionUri, 'dist/src/webview.js')
        )
        const cssUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(globals.context.extensionUri, 'src/codewhisperer/views/css/securityIssuePanel.css')
        )
        const iconsUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(globals.context.extensionUri, 'resources/css/icons.css')
        )
        const nonce = getNonce()

        return /*html*/ `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${
            this._panel.webview.cspSource
        } 'unsafe-inline'; img-src vscode-resource: 'self'; font-src vscode-resource: 'self';">
            <link rel="stylesheet" href="${cssUri}">
            <link rel="stylesheet" href="${iconsUri}">
          </head>
          <body>
          ${this._getHtmlBody()}
          <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
          </body>
        </html>`
    }

    private _getHtmlBody(issue: CodeScanIssue | undefined = this._issue) {
        if (!issue) {
            return ''
        }

        const severityImgUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(
                globals.context.extensionUri,
                `src/codewhisperer/images/severity-${issue?.severity.toLowerCase()}.svg`
            )
        )
        const [suggestedFix] = issue.remediation.suggestedFixes ?? []
        const codeFixAvailable = suggestedFix
            ? /*html*/ `<p style="color:var(--vscode-charts-green);"><span class="icon icon-sm icon-vscode-pass-filled"></span> Yes</p>`
            : /*html*/ `<p style="color:var(--vscode-charts-red);"><span class="icon icon-sm icon-vscode-circle-slash"></span> No</p>`

        let body = /*html*/ `
        <h1 class="page-header">
          ${issue.detectorName}
          <img src="${severityImgUri}" />
        </h1>
        <p>${md.render(issue.description.markdown)}</p>
        <vscode-divider></vscode-divider>

        <div class="flex-container detector-details">
          <div>
            <b>Common Weakness Enumeration (CWE)</b>
            <p>${issue.relatedVulnerabilities
                .map(
                    cwe =>
                        /*html*/ `<vscode-link href="https://cwe.mitre.org/data/definitions/${cwe
                            .split('-')
                            .pop()}">${cwe} <span class="icon icon-sm icon-vscode-link-external"></span></vscode-link>`
                )
                .join(', ')}</p>
          </div>
          <div>
            <b>Code fix available</b>
            ${codeFixAvailable}
          </div>
          <div>
            <b>Detector library</b>
            <p><vscode-link href="https://docs.aws.amazon.com/codeguru/detector-library/${issue.detectorId
                .split('@')
                .shift()}">${
            issue.detectorName
        } <span class="icon icon-sm icon-vscode-link-external"></span></vscode-link></p>
          </div>
        </div>

        <vscode-divider></vscode-divider>
        <h3>Suggested remediation</h3>
        <p>${md.render(issue.remediation.recommendation.text)}</p>`

        if (suggestedFix) {
            body += /*html*/ `
            <h3>Suggested code fix</h3>
            ${md.render('```diff\n' + suggestedFix.code + '\n```')}
            <h3>Why are we recommending this?</h3>
            <p>${suggestedFix.description}</p>
            <div align="right">
              <vscode-button appearance="secondary">Ignore</vscode-button>
              <vscode-button>Apply Fix</vscode-button>
            </div>
            <br />`
        }

        return body
    }

    private _setWebviewMessageListener() {
        this._panel.webview.onDidReceiveMessage((message: any) => {}, undefined, this._disposables)
    }
}
