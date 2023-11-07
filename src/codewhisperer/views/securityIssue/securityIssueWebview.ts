/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { VueWebview } from '../../../webviews/main'
import { CodeScanIssue } from '../../models/model'

export class SecurityIssueWebview extends VueWebview {
    public readonly id = 'aws.codeWhisperer.securityIssue'
    public readonly source = 'src/codewhisperer/views/securityIssue/vue/index.js'
    private issue: CodeScanIssue | undefined
    private filePath: string | undefined

    public constructor() {
        super()
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
        vscode.commands.executeCommand('aws.codeWhisperer.applySecurityFix', this.issue, this.filePath, 'webview')
    }

    public getRelativePath() {
        if (this.issue) {
            return vscode.workspace.asRelativePath(this.issue.filePath)
        }
        return ''
    }

    public navigateToFile() {
        if (this.issue) {
            const position = new vscode.Position(this.issue.startLine, 1)
            const uri = vscode.Uri.file(this.issue.filePath)
            vscode.commands.executeCommand('vscode.open', uri, {
                selection: new vscode.Selection(position, position),
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
