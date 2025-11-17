/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebviewView, WebviewViewProvider, Disposable } from 'vscode'
import { Output } from '@aws-sdk/client-cloudformation'
import { LanguageClient } from 'vscode-languageclient/node'
import { extractErrorMessage } from '../utils'
import { DescribeStackRequest } from '../stacks/actions/stackActionProtocol'
import { StackViewCoordinator } from './stackViewCoordinator'

export class StackOutputsWebviewProvider implements WebviewViewProvider, Disposable {
    private view?: WebviewView
    private stackName?: string
    private outputs: Output[] = []
    private readonly disposables: Disposable[] = []

    constructor(
        private readonly client: LanguageClient,
        private readonly coordinator: StackViewCoordinator
    ) {
        this.disposables.push(
            coordinator.onDidChangeStack(async (state) => {
                if (state.stackName && !state.isChangeSetMode) {
                    this.stackName = state.stackName
                    this.outputs = []
                    this.render()
                    await this.showOutputs(state.stackName)
                } else if (!state.stackName || state.isChangeSetMode) {
                    this.stackName = undefined
                    this.outputs = []
                    this.render()
                }
            })
        )
    }

    async resolveWebviewView(webviewView: WebviewView): Promise<void> {
        this.view = webviewView
        webviewView.webview.options = { enableScripts: true }

        if (this.stackName) {
            await this.loadOutputs()
        } else {
            this.render()
        }
    }

    async showOutputs(stackName: string): Promise<void> {
        this.stackName = stackName
        this.outputs = []

        if (this.view) {
            await this.loadOutputs()
        }
    }

    private async loadOutputs(): Promise<void> {
        if (!this.stackName) {
            return
        }

        try {
            const result = await this.client.sendRequest(DescribeStackRequest, {
                stackName: this.stackName,
            })

            this.outputs = result.stack?.Outputs ?? []
            // Only update coordinator if status changed
            if (result.stack?.StackStatus && this.coordinator.currentStackStatus !== result.stack.StackStatus) {
                await this.coordinator.setStack(this.stackName, result.stack.StackStatus)
            }
            this.render()
        } catch (error) {
            this.renderError(`Failed to load outputs: ${extractErrorMessage(error)}`)
        }
    }

    private renderError(message: string): void {
        if (!this.view || !this.view.visible) {
            return
        }
        this.view.webview.html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { 
            font-family: var(--vscode-font-family); 
            padding: 20px;
            color: var(--vscode-errorForeground);
        }
    </style>
</head>
<body>
    <h3>Error</h3>
    <p>${message}</p>
</body>
</html>`
    }

    private render(): void {
        if (!this.view || this.view.visible === false) {
            return
        }

        this.view.webview.html = this.getHtml(this.outputs)
    }

    private getHtml(outputs: Output[]): string {
        const outputRows =
            outputs.length > 0
                ? outputs
                      .map(
                          (output) => `
            <tr>
                <td>${output.OutputKey ?? ''}</td>
                <td>${output.OutputValue ?? ''}</td>
                <td>${output.Description ?? ''}</td>
                <td>${output.ExportName ?? ''}</td>
            </tr>
        `
                      )
                      .join('')
                : '<tr><td colspan="4" style="text-align: center; padding: 20px;">No outputs found</td></tr>'

        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { 
            font-family: var(--vscode-font-family); 
            padding: 0;
            margin: 0;
            color: var(--vscode-foreground);
        }
        .header {
            position: sticky;
            top: 0;
            background: var(--vscode-editor-background);
            z-index: 10;
            padding: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .stack-info {
            display: flex;
            gap: 12px;
            align-items: baseline;
        }
        .output-count {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .table-container {
            padding: 8px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }
        thead {
            position: sticky;
            top: 40px;
            background: var(--vscode-editor-background);
            z-index: 5;
        }
        th {
            text-align: left;
            padding: 6px;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            font-weight: 600;
        }
        td {
            padding: 6px;
            border-bottom: 1px solid var(--vscode-panel-border);
            word-break: break-word;
        }
        tr:hover { background: var(--vscode-list-hoverBackground); }
    </style>
</head>
<body>
    <div class="header">
        <div class="stack-info">
            <span>${this.stackName ?? ''}</span>
            <span class="output-count">(${outputs.length} outputs)</span>
        </div>
    </div>
    <div class="table-container">
        <table>
            <thead>
                <tr>
                    <th>Key</th>
                    <th>Value</th>
                    <th>Description</th>
                    <th>Export Name</th>
                </tr>
            </thead>
            <tbody>
                ${outputRows}
            </tbody>
        </table>
    </div>
</body>
</html>`
    }

    dispose(): void {
        this.view = undefined
        for (const d of this.disposables) {
            d.dispose()
        }
    }
}
