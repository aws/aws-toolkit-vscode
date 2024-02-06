/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SecurityPanelSet, SecurityPanelItem, AggregatedCodeScanIssue } from '../models/model'
import { getLocalDatetime } from '../util/commonUtil'

function makeUri(...args: Parameters<typeof openEditorAtRange>): vscode.Uri {
    return vscode.Uri.parse(`command:aws.codeWhisperer.openEditorAtRange?${encodeURIComponent(JSON.stringify(args))}`)
}

async function openEditorAtRange(path: string, startLine: number, endLine: number) {
    const uri = vscode.Uri.parse(path)
    await vscode.window.showTextDocument(uri, { preview: false, preserveFocus: true }).then(e => {
        e.selection = new vscode.Selection(startLine, 0, endLine, 0)
        e.revealRange(new vscode.Range(startLine, 0, endLine, 0), vscode.TextEditorRevealType.InCenterIfOutsideViewport)
    })
}

vscode.commands.registerCommand('aws.codeWhisperer.openEditorAtRange', openEditorAtRange)

export class SecurityPanelViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'aws.codeWhisperer.securityPanel'
    private view?: vscode.WebviewView
    private persistLog: string[] = []
    private dynamicLog: string[] = []
    private panelSets: SecurityPanelSet[] = []
    private decorationType: vscode.TextEditorDecorationType | undefined
    private codiconUri: vscode.Uri | undefined
    private cssUri: vscode.Uri | undefined
    private extensionContext?: vscode.ExtensionContext
    private packageName: string = ''

    constructor(context: vscode.ExtensionContext) {
        this.extensionContext = context
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext<unknown>,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        this.view = webviewView
        this.view.webview.options = {
            enableScripts: true,
            enableCommandUris: true,
        }
        if (this.extensionContext) {
            this.codiconUri = webviewView.webview.asWebviewUri(
                vscode.Uri.joinPath(this.extensionContext.extensionUri, 'resources', 'css', 'icons.css')
            )
            this.cssUri = webviewView.webview.asWebviewUri(
                vscode.Uri.joinPath(
                    this.extensionContext.extensionUri,
                    'src',
                    'codewhisperer',
                    'views/css',
                    'securityPanel.css'
                )
            )
        }
        this.view.webview.html = this.getHtml(this.view.webview)
    }

    public startNew(packageName: string) {
        if (this.panelSets.length > 0) {
            this.persistLines()
            this.panelSets = []
        }
        this.dynamicLog = []
        this.packageName = packageName
        this.persistLog.push(
            `<p>[${getLocalDatetime()}] Starting security scan for <span class="packageName">${packageName}</span> ...</p>`
        )
        this.update()
    }

    public addLines(
        securityRecommendationCollection: AggregatedCodeScanIssue[],
        editor: vscode.TextEditor | undefined
    ) {
        this.createPanelSets(securityRecommendationCollection)
        const total = this.panelSets.reduce((accumulator, current) => {
            return accumulator + current.items.length
        }, 0)
        this.persistLog.push(
            `<p>[${getLocalDatetime()}] Security scan for <span class="packageName">${
                this.packageName
            }</span> found <span class="total">${total}</span> issues</p>`
        )
        this.panelSets.forEach((panelSet, index) => {
            this.addLine(panelSet, index)
        })
        this.update()
        if (editor) {
            this.setDecoration(editor, editor.document.uri)
        }
        this.view?.show()
    }

    private update() {
        if (this.view) {
            this.view.webview.html = this.getHtml(this.view.webview)
        }
    }

    private addLine(panelSet: SecurityPanelSet, index: number) {
        const filePath = panelSet.path
        const fileName = filePath.substring(Number(filePath.lastIndexOf('/')) + 1)
        const handleId = 'handle'.concat(Date.now().toString()).concat(index.toString())
        this.dynamicLog.push(
            `<section class="accordion"><input type="checkbox" name="collapse" id="${handleId}" checked="checked"><div class="handle" ><label for="${handleId}">${fileName}</label></div>`
        )
        panelSet.items.forEach(item => {
            if (item.severity === vscode.DiagnosticSeverity.Warning) {
                this.dynamicLog.push(`${this.addClickableWarningItem(item)}`)
            } else {
                this.dynamicLog.push(`${this.addClickableInfoItem(item)}`)
            }
        })
        this.dynamicLog.push(`</section>`)
    }

    private persistLines() {
        this.panelSets.forEach((panelSet, index) => {
            this.persistLine(panelSet, index)
        })
    }

    private persistLine(panelSet: SecurityPanelSet, index: number) {
        const filePath = panelSet.path
        const fileName = filePath.substring(Number(filePath.lastIndexOf('/')) + 1)
        const handleId = 'handle'.concat(Date.now().toString()).concat(index.toString())
        this.persistLog.push(
            `<section class="accordion"><input type="checkbox" name="collapse" id="${handleId}" checked="checked"><div class="handle" ><label for="${handleId}">${fileName}</label></div>`
        )
        panelSet.items.forEach(item => {
            if (item.severity === vscode.DiagnosticSeverity.Warning) {
                this.persistLog.push(`${this.addUnclickableWarningItem(item)}`)
            } else {
                this.persistLog.push(`${this.addUnclickableInfoItem(item)}`)
            }
        })
        this.persistLog.push(`</section>`)
    }

    private addUnclickableWarningItem(item: SecurityPanelItem) {
        return `<div class="content warning">${item.message} [Ln ${Number(item.range.start.line)}, Col ${
            item.range.start.character
        }]</div>`
    }

    private addUnclickableInfoItem(item: SecurityPanelItem) {
        return `<div class="content rerun">Re-scan to validate the fix: ${item.message} [Ln ${Number(
            item.range.start.line
        )}, Col ${item.range.start.character}]</div>`
    }

    private addClickableWarningItem(item: SecurityPanelItem) {
        const uri = makeUri(item.path, item.range.start.line, item.range.end.line).toString()
        return `<a class="content warning" title="Open Document" href="${uri}">${item.message} [Ln ${Number(
            item.range.start.line
        )}, Col ${item.range.start.character}]</a><br>`
    }

    private addClickableInfoItem(item: SecurityPanelItem) {
        const uri = makeUri(item.path, item.range.start.line, item.range.end.line).toString()
        return `<a class="content info" title="Open Document" href="${uri}">Re-scan to validate the fix: ${
            item.message
        } [Ln ${Number(item.range.start.line)}, Col ${item.range.start.character}]</a><br>`
    }

    private createPanelSets(securityRecommendationCollection: AggregatedCodeScanIssue[]) {
        securityRecommendationCollection.forEach(securityRecommendation => {
            const panelSet: SecurityPanelSet = {
                path: securityRecommendation.filePath,
                uri: vscode.Uri.parse(securityRecommendation.filePath),
                items: [],
            }
            securityRecommendation.issues.forEach(issue => {
                panelSet.items.push({
                    path: securityRecommendation.filePath,
                    range: new vscode.Range(issue.startLine, 0, issue.endLine, 0),
                    severity: vscode.DiagnosticSeverity.Warning,
                    message: issue.comment,
                    issue: issue,
                    decoration: {
                        range: new vscode.Range(issue.startLine, 0, issue.endLine, 0),
                        hoverMessage: issue.comment,
                    },
                })
            })
            this.panelSets.push(panelSet)
        })
    }

    private getHtml(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${
            webview.cspSource
        }; style-src ${webview.cspSource};">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link href="${this.cssUri}" media="all" rel="stylesheet">
        <link href="${this.codiconUri}" media="all" rel="stylesheet">
        </head>
        <body>
            ${this.getHtmlContent()}
        </body>
        </html>`
    }

    private getHtmlContent(): string {
        if (this.persistLog.length === 0) {
            return 'No security issues have been detected in the workspace.'
        }
        return this.persistLog.join('') + this.dynamicLog.join('')
    }

    private getDecorator() {
        if (this.decorationType === undefined) {
            this.decorationType = vscode.window.createTextEditorDecorationType({
                rangeBehavior: vscode.DecorationRangeBehavior.OpenOpen,
                textDecoration: 'goldenrod wavy underline 0.01em',
            })
        }
        return this.decorationType
    }

    public setDecoration(editor: vscode.TextEditor, uri: vscode.Uri) {
        editor.setDecorations(this.getDecorator(), [])
        const rangesToRend: vscode.DecorationOptions[] = []
        this.panelSets.forEach(panelSet => {
            if (panelSet.uri.fsPath === uri.fsPath) {
                panelSet.items.forEach(item => {
                    if (item.severity === vscode.DiagnosticSeverity.Warning) {
                        rangesToRend.push(item.decoration)
                    }
                })
            }
        })
        if (rangesToRend.length > 0) {
            editor.setDecorations(this.getDecorator(), rangesToRend)
        }
    }

    public disposeSecurityPanelItem(event: vscode.TextDocumentChangeEvent, editor: vscode.TextEditor | undefined) {
        const uri = event.document.uri
        if (this.panelSets.length === 0) {
            return
        }
        const index = this.panelSets.findIndex(panelSet => panelSet.uri.fsPath === uri.fsPath)
        if (index === -1) {
            return
        }

        const currentPanelSet = this.panelSets[index]
        const changedRange = event.contentChanges[0].range
        const changedText = event.contentChanges[0].text
        const lineOffset = this.getLineOffset(changedRange, changedText)

        currentPanelSet.items.forEach((item, index, items) => {
            const intersection = changedRange.intersection(item.range)
            if (
                item.severity === vscode.DiagnosticSeverity.Warning &&
                intersection &&
                (/\S/.test(changedText) || changedText === '')
            ) {
                item.severity = vscode.DiagnosticSeverity.Information
                item.range = new vscode.Range(intersection.start, intersection.start)
            } else if (item.range.start.line >= changedRange.end.line) {
                item.range = new vscode.Range(
                    Number(item.range.start.line) + lineOffset,
                    item.range.start.character,
                    Number(item.range.end.line) + lineOffset,
                    item.range.end.character
                )
            }
            items[index] = item
        })
        this.panelSets[index] = currentPanelSet
        this.dynamicLog = []
        this.panelSets.forEach((panelSet, index) => {
            this.addLine(panelSet, index)
        })
        this.update()
        if (editor) {
            this.setDecoration(editor, editor.document.uri)
        }
    }

    private getLineOffset(range: vscode.Range, text: string) {
        const originLines = range.end.line - range.start.line + 1
        const changedLines = text.split('\n').length
        return changedLines - originLines
    }
}
