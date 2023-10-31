/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { VueWebview } from '../../../webviews/main'
import { CodeScanIssueCommandArgs } from '../../models/model'

export class SecurityIssueWebview extends VueWebview {
    public readonly id = 'aws.codeWhisperer.securityIssue'
    public readonly source = 'src/codewhisperer/views/securityIssue/vue/index.js'
    private issue: CodeScanIssueCommandArgs | undefined

    public constructor() {
        super()
    }

    public getIssue() {
        return this.issue
    }

    public setIssue(issue: CodeScanIssueCommandArgs) {
        this.issue = issue
    }

    public applyFix() {
        vscode.commands.executeCommand('aws.codeWhisperer.applySecurityFix', this.issue)
    }

    public closeWebview(findingId: string) {
        if (this.issue?.findingId === findingId) {
            this.dispose()
        }
    }
}

const Panel = VueWebview.compilePanel(SecurityIssueWebview)
let activePanel: InstanceType<typeof Panel> | undefined

export async function showSecurityIssueWebview(ctx: vscode.ExtensionContext, issue: CodeScanIssueCommandArgs) {
    activePanel ??= new Panel(ctx)
    activePanel.server.setIssue(issue)

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
