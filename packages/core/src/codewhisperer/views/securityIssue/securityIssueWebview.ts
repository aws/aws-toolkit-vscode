/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { VueWebview } from '../../../webviews/main'
import { CodeScanIssue } from '../../models/model'
import { Component } from '../../../shared/telemetry/telemetry'

export class SecurityIssueWebview extends VueWebview {
    public static readonly sourcePath: string = 'src/codewhisperer/views/securityIssue/vue/index.js'
    public readonly id = 'aws.codeWhisperer.securityIssue'

    private issue: CodeScanIssue | undefined
    private filePath: string | undefined

    public constructor() {
        super(SecurityIssueWebview.sourcePath)
    }

    public getIssue() {
        return this.issue
    }

    public setIssue(issue: CodeScanIssue) {
        this.issue = issue
    }

    public setFilePath(filePath: string) {
        this.filePath = filePath
    }

    public applyFix() {
        const args: [CodeScanIssue | undefined, string | undefined, Component] = [this.issue, this.filePath, 'webview']
        void vscode.commands.executeCommand('aws.amazonq.applySecurityFix', ...args)
    }

    public getRelativePath() {
        if (this.filePath) {
            return vscode.workspace.asRelativePath(this.filePath)
        }
        return ''
    }

    public navigateToFile() {
        if (this.issue && this.filePath) {
            const range = new vscode.Range(this.issue.startLine, 0, this.issue.endLine, 0)
            return vscode.workspace.openTextDocument(this.filePath).then(doc => {
                void vscode.window.showTextDocument(doc, {
                    selection: range,
                    viewColumn: vscode.ViewColumn.One,
                    preview: true,
                })
            })
        }
    }

    public closeWebview(findingId: string) {
        if (this.issue?.findingId === findingId) {
            this.dispose()
        }
    }
}

const Panel = VueWebview.compilePanel(SecurityIssueWebview)
let activePanel: InstanceType<typeof Panel> | undefined

export async function showSecurityIssueWebview(ctx: vscode.ExtensionContext, issue: CodeScanIssue, filePath: string) {
    activePanel ??= new Panel(ctx)
    activePanel.server.setIssue(issue)
    activePanel.server.setFilePath(filePath)

    const webviewPanel = await activePanel.show({
        title: 'CodeWhisperer Security Issue',
        viewColumn: vscode.ViewColumn.Beside,
        cssFiles: ['securityIssue.css'],
    })
    webviewPanel.iconPath = {
        light: vscode.Uri.joinPath(ctx.extensionUri, 'resources/icons/vscode/light/shield.svg'),
        dark: vscode.Uri.joinPath(ctx.extensionUri, 'resources/icons/vscode/dark/shield.svg'),
    }

    webviewPanel.onDidDispose(() => (activePanel = undefined))
}

export async function closeSecurityIssueWebview(findingId: string) {
    activePanel?.server.closeWebview(findingId)
}
