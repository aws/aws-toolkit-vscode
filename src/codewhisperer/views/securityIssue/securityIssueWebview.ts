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

    public constructor() {
        super()
    }

    public getIssue() {
        return this.issue
    }

    public setIssue(issue: CodeScanIssue) {
        this.issue = issue
    }

    public applyFix() {
        // TODO
    }
}

const Panel = VueWebview.compilePanel(SecurityIssueWebview)
let activePanel: InstanceType<typeof Panel> | undefined

export async function showSecurityIssueWebview(ctx: vscode.ExtensionContext, issue: CodeScanIssue) {
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
