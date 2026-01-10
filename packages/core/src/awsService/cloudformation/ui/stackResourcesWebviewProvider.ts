/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebviewView, WebviewViewProvider, Disposable } from 'vscode'
import { LanguageClient } from 'vscode-languageclient/node'
import { showErrorMessage } from './message'
import { GetStackResourcesRequest } from '../stacks/actions/stackActionProtocol'
import { StackResourceSummary, GetStackResourcesParams } from '../stacks/actions/stackActionRequestType'
import { StackViewCoordinator } from './stackViewCoordinator'
import { arnToConsoleTabUrl, externalLinkSvg, consoleLinkStyles } from '../consoleLinksUtils'

const ResourcesPerPage = 50

export class StackResourcesWebviewProvider implements WebviewViewProvider, Disposable {
    private _view?: WebviewView
    private stackName = ''
    private stackArn = ''
    private allResources: StackResourceSummary[] = []
    private currentPage = 0
    private nextToken?: string
    private updateInterval?: NodeJS.Timeout
    private readonly disposables: Disposable[] = []

    constructor(
        private client: LanguageClient,
        private readonly coordinator: StackViewCoordinator
    ) {
        this.disposables.push(
            coordinator.onDidChangeStack(async (state) => {
                if (state.stackName && !state.isChangeSetMode) {
                    this.stopAutoRefresh()
                    this.stackName = state.stackName
                    this.stackArn = state.stackArn || ''
                    this.allResources = []
                    this.currentPage = 0
                    this.nextToken = undefined
                    if (this._view && this._view.visible) {
                        this._view.webview.html = this.getHtmlContent()
                    }
                    await this.updateData(state.stackName)
                } else if (!state.stackName || state.isChangeSetMode) {
                    this.stopAutoRefresh()
                    this.stackName = ''
                    this.stackArn = ''
                    this.allResources = []
                    if (this._view && this._view.visible) {
                        this._view.webview.html = this.getHtmlContent()
                    }
                }

                // Stop auto-refresh if stack is in terminal state
                if (state.stackStatus && !this.isStackInTransientState(state.stackStatus)) {
                    this.stopAutoUpdate()
                }
            })
        )
    }

    private isStackInTransientState(status: string): boolean {
        return status.includes('_IN_PROGRESS') || status.includes('_CLEANUP_IN_PROGRESS')
    }

    async updateData(stackName: string) {
        this.stackName = stackName
        this.allResources = []
        this.currentPage = 0
        this.nextToken = undefined
        await this.loadResources()

        if (this._view && this._view.visible) {
            this._view.webview.html = this.getHtmlContent()
        }
    }

    resolveWebviewView(webviewView: WebviewView) {
        this._view = webviewView
        this.setupWebview(webviewView)
        this.setupMessageHandling(webviewView)
        this.setupLifecycleHandlers(webviewView)
    }

    private setupWebview(webviewView: WebviewView) {
        webviewView.webview.options = { enableScripts: true }
        webviewView.webview.html = this.getHtmlContent()
    }

    private setupMessageHandling(webviewView: WebviewView) {
        webviewView.webview.onDidReceiveMessage(async (message: { command: string }) => {
            if (message.command === 'nextPage') {
                await this.loadNextPage()
            } else if (message.command === 'prevPage') {
                await this.loadPrevPage()
            }
        })
    }

    private setupLifecycleHandlers(webviewView: WebviewView) {
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.render()
                this.startAutoUpdate()
            } else {
                this.stopAutoUpdate()
            }
        })

        if (webviewView.visible) {
            this.startAutoUpdate()
        }

        webviewView.onDidDispose(() => {
            this.stopAutoUpdate()
        })
    }

    private async loadResources(): Promise<void> {
        if (!this.client || !this.stackName) {
            return
        }

        try {
            const params: GetStackResourcesParams = { stackName: this.stackName }
            if (this.nextToken) {
                params.nextToken = this.nextToken
                const result = await this.client.sendRequest(GetStackResourcesRequest, params)
                this.allResources.push(...result.resources)
                this.nextToken = result.nextToken
            } else {
                const result = await this.client.sendRequest(GetStackResourcesRequest, params)
                this.allResources = result.resources
                this.nextToken = result.nextToken
            }
        } catch (error) {
            showErrorMessage(`Failed to fetch stack resources: ${error}`)
        }
    }

    private async loadNextPage(): Promise<void> {
        const totalPages = Math.ceil(this.allResources.length / ResourcesPerPage)
        const nextPageIndex = this.currentPage + 1

        // Don't proceed if we're already at the last page and have no more data
        if (nextPageIndex >= totalPages && !this.nextToken) {
            return
        }

        if (nextPageIndex < totalPages) {
            this.currentPage = nextPageIndex
            this.render()
        } else if (this.nextToken) {
            await this.loadResources()
            if (this.allResources.length > nextPageIndex * ResourcesPerPage) {
                this.currentPage = nextPageIndex
                this.render()
            }
        }
    }

    private async loadPrevPage(): Promise<void> {
        // Don't proceed if we're already at the first page
        if (this.currentPage <= 0) {
            return
        }

        this.currentPage--
        this.render()
    }

    private render(): void {
        if (this._view && this._view.visible !== false) {
            this._view.webview.html = this.getHtmlContent()
        }
    }

    private startAutoUpdate() {
        if (!this.updateInterval && this.stackName) {
            this.updateInterval = setInterval(async () => {
                if (this._view && !this.coordinator.currentStackStatus?.includes('_IN_PROGRESS')) {
                    this.stopAutoUpdate()
                    return
                }

                if (this._view) {
                    // Reset to page 1 with fresh data
                    this.allResources = []
                    this.currentPage = 0
                    this.nextToken = undefined
                    await this.loadResources()

                    if (this._view && this._view.visible !== false) {
                        this._view.webview.html = this.getHtmlContent()
                    }
                }
            }, 5000)
        }
    }

    private stopAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval)
            this.updateInterval = undefined
        }
    }

    private stopAutoRefresh() {
        this.stopAutoUpdate()
    }

    private getHtmlContent(): string {
        const start = this.currentPage * ResourcesPerPage
        const end = start + ResourcesPerPage
        const pageResources = this.allResources.slice(start, end)
        const totalPages = Math.ceil(this.allResources.length / ResourcesPerPage)
        const hasMore = this.nextToken !== undefined

        if (!pageResources || pageResources.length === 0) {
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
        .header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        .stack-info {
            display: inline-flex;
            gap: 6px;
            align-items: center;
        }
        ${consoleLinkStyles}
        .pagination {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        .resource-count {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .table-container {
            padding: 8px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="stack-info">
            ${this.stackName}
            ${this.stackArn ? `<a href="${arnToConsoleTabUrl(this.stackArn, 'resources')}" class="console-link" title="View in AWS Console">${externalLinkSvg()}</a>` : ''}
            <span class="resource-count">(0 resources)</span>
        </div>
    </div>
    <div class="table-container">
        <p style="text-align: center; padding: 20px;">No resources found</p>
    </div>
</body>
</html>`
        }

        const resourceRows = pageResources
            .map(
                (resource) => `
            <tr>
                <td>${resource.LogicalResourceId}</td>
                <td>${resource.PhysicalResourceId || ''}</td>
                <td>${resource.ResourceType}</td>
                <td>${resource.ResourceStatus}</td>
            </tr>
        `
            )
            .join('')

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
        .header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        .stack-info {
            display: inline-flex;
            gap: 6px;
            align-items: center;
        }
        ${consoleLinkStyles}
        .pagination {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        .resource-count {
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
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 8px;
            cursor: pointer;
            border-radius: 2px;
            font-size: 11px;
        }
        button:hover { background: var(--vscode-button-hoverBackground); }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-content">
            <div class="stack-info">
                ${this.stackName}
                ${this.stackArn ? `<a href="${arnToConsoleTabUrl(this.stackArn, 'resources')}" class="console-link" title="View in AWS Console">${externalLinkSvg()}</a>` : ''}
                <span class="resource-count">(${this.allResources.length} resources${hasMore ? ' loaded' : ''})</span>
            </div>
            <div class="pagination">
                <span>Page ${this.currentPage + 1} of ${totalPages || 1}</span>
                <button onclick="prevPage()" ${this.currentPage === 0 ? 'disabled' : ''}>Previous</button>
                <button onclick="nextPage()" ${this.currentPage >= totalPages - 1 && !hasMore ? 'disabled' : ''}>${this.currentPage >= totalPages - 1 && hasMore ? 'Load More' : 'Next'}</button>
            </div>
        </div>
    </div>
    <div class="table-container">
        <table>
            <thead>
                <tr>
                    <th>Logical ID</th>
                    <th>Physical ID</th>
                    <th>Type</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${resourceRows}
            </tbody>
        </table>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        function nextPage() { vscode.postMessage({ command: 'nextPage' }); }
        function prevPage() { vscode.postMessage({ command: 'prevPage' }); }
    </script>
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
