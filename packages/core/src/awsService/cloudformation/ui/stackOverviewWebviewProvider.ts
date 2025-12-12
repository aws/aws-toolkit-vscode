/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebviewView, WebviewViewProvider, Disposable } from 'vscode'
import { LanguageClient } from 'vscode-languageclient/node'
import { Stack } from '@aws-sdk/client-cloudformation'
import { StackViewCoordinator } from './stackViewCoordinator'
import { DescribeStackRequest } from '../stacks/actions/stackActionProtocol'
import { extractErrorMessage, getStackStatusClass, isStackInTransientState } from '../utils'
import { externalLinkSvg, consoleLinkStyles, arnToConsoleUrl } from '../consoleLinksUtils'

export class StackOverviewWebviewProvider implements WebviewViewProvider, Disposable {
    private view?: WebviewView
    private stack?: Stack
    private readonly disposables: Disposable[] = []
    private refreshTimer?: NodeJS.Timeout
    private currentStackName?: string

    constructor(
        private readonly client: LanguageClient,
        private readonly coordinator: StackViewCoordinator
    ) {
        this.disposables.push(
            coordinator.onDidChangeStack(async (state) => {
                if (state.stackName && !state.isChangeSetMode) {
                    this.stopAutoRefresh()
                    this.currentStackName = state.stackName
                    this.stack = undefined
                    this.render()
                    await this.loadStack(state.stackName)
                    this.startAutoRefresh()
                } else {
                    this.stopAutoRefresh()
                    this.currentStackName = undefined
                    this.stack = undefined
                    this.render()
                }

                // Stop auto-refresh if stack is in terminal state
                if (state.stackStatus && !isStackInTransientState(state.stackStatus)) {
                    this.stopAutoRefresh()
                }
            })
        )
    }

    private startAutoRefresh(): void {
        this.stopAutoRefresh()
        if (this.currentStackName) {
            this.refreshTimer = setInterval(() => {
                if (this.currentStackName) {
                    void this.loadStack(this.currentStackName)
                }
            }, 5000)
        }
    }

    private stopAutoRefresh(): void {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer)
            this.refreshTimer = undefined
        }
    }

    private async loadStack(stackName: string): Promise<void> {
        try {
            const result = await this.client.sendRequest(DescribeStackRequest, { stackName })
            if (result.stack) {
                this.stack = result.stack
                // Only update coordinator if status changed
                if (this.coordinator.currentStackStatus !== result.stack.StackStatus) {
                    await this.coordinator.setStack(stackName, result.stack.StackStatus, result.stack.StackId)
                }
                this.render()
            }
        } catch (error) {
            this.stack = undefined
            this.renderError(`Failed to load stack: ${extractErrorMessage(error)}`)
        }
    }

    resolveWebviewView(webviewView: WebviewView): void {
        this.view = webviewView
        webviewView.webview.options = { enableScripts: true }

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible && this.currentStackName) {
                this.render()
                this.startAutoRefresh()
            } else {
                this.stopAutoRefresh()
            }
        })

        webviewView.onDidDispose(() => {
            this.stopAutoRefresh()
        })

        this.render()
    }

    async showStackOverview(stackName: string): Promise<void> {
        if (this.view) {
            await this.loadStack(stackName)
        }
    }

    private render(): void {
        if (!this.view || !this.view.visible) {
            return
        }

        if (!this.stack) {
            this.view.webview.html = this.getEmptyContent()
            return
        }

        this.view.webview.html = this.getWebviewContent(this.stack)
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

    private getEmptyContent(): string {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { 
            font-family: var(--vscode-font-family);
            padding: 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <p>Select a stack to view details</p>
</body>
</html>`
    }

    private getWebviewContent(stack: Stack): string {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { 
            font-family: var(--vscode-font-family); 
            padding: 20px;
            color: var(--vscode-foreground);
        }
        .section { margin-bottom: 20px; }
        .label { 
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
        }
        .value { 
            margin-bottom: 12px;
            word-break: break-word;
        }
        .stack-header {
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        ${consoleLinkStyles}
        .status {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 12px;
        }
        .status-complete { 
            background: var(--vscode-testing-iconPassed);
            color: var(--vscode-editor-background);
        }
        .status-failed { 
            background: var(--vscode-testing-iconFailed);
            color: var(--vscode-editor-background);
        }
        .status-progress { 
            background: var(--vscode-testing-iconQueued);
            color: var(--vscode-editor-background);
        }
    </style>
</head>
<body>
    <div class="section">
        <div class="label">Stack Name</div>
        <div class="stack-header">
            ${stack.StackName ?? 'N/A'}
            ${stack.StackId ? `<a href="${arnToConsoleUrl(stack.StackId)}" class="console-link" title="View in AWS Console">${externalLinkSvg()}</a>` : ''}
        </div>
    </div>
    <div class="section">
        <div class="label">Status</div>
        <div class="value">
            <span class="status ${getStackStatusClass(stack.StackStatus)}">${stack.StackStatus ?? 'UNKNOWN'}</span>
        </div>
    </div>
    ${
        stack.StackId
            ? `
    <div class="section">
        <div class="label">Stack ID</div>
        <div class="value">${stack.StackId}</div>
    </div>`
            : ''
    }
    ${
        stack.Description
            ? `
    <div class="section">
        <div class="label">Description</div>
        <div class="value">${stack.Description}</div>
    </div>`
            : ''
    }
    ${
        stack.CreationTime
            ? `
    <div class="section">
        <div class="label">Created</div>
        <div class="value">${new Date(stack.CreationTime).toLocaleString()}</div>
    </div>`
            : ''
    }
    ${
        stack.LastUpdatedTime
            ? `
    <div class="section">
        <div class="label">Last Updated</div>
        <div class="value">${new Date(stack.LastUpdatedTime).toLocaleString()}</div>
    </div>`
            : ''
    }
    ${
        stack.StackStatusReason
            ? `
    <div class="section">
        <div class="label">Status Reason</div>
        <div class="value">${stack.StackStatusReason}</div>
    </div>`
            : ''
    }
</body>
</html>`
    }

    dispose(): void {
        this.stopAutoRefresh()
        for (const d of this.disposables) {
            d.dispose()
        }
    }
}
