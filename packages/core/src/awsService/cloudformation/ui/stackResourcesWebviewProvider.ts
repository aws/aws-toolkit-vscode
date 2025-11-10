/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebviewView, WebviewViewProvider } from 'vscode'
import { LanguageClient } from 'vscode-languageclient/node'
import { showErrorMessage } from './message'
import { GetStackResourcesRequest } from '../stacks/actions/stackActionProtocol'
import { StackResourceSummary, GetStackResourcesParams } from '../stacks/actions/stackActionRequestType'

const ResourcesPerPage = 50

export class StackResourcesWebviewProvider implements WebviewViewProvider {
    private _view?: WebviewView
    private stackName = ''
    private allResources: StackResourceSummary[] = []
    private currentPage = 0
    private nextToken?: string
    private updateInterval?: NodeJS.Timeout

    constructor(private client: LanguageClient) {}

    async updateData(stackName: string) {
        this.stackName = stackName
        this.allResources = []
        this.currentPage = 0
        this.nextToken = undefined
        await this.loadResources()

        if (this._view) {
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
            }
            const result = await this.client.sendRequest(GetStackResourcesRequest, params)
            this.allResources.push(...result.resources)
            this.nextToken = result.nextToken
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
        if (this._view) {
            this._view.webview.html = this.getHtmlContent()
        }
    }

    private startAutoUpdate() {
        if (!this.updateInterval && this.stackName) {
            this.updateInterval = setInterval(async () => {
                if (this._view) {
                    // For auto-refresh, reload from the beginning to get fresh data
                    const currentPage = this.currentPage
                    this.allResources = []
                    this.currentPage = 0
                    this.nextToken = undefined

                    // Load enough pages to get back to where we were
                    for (let i = 0; i <= currentPage; i++) {
                        await this.loadResources()
                        if (!this.nextToken) {
                            break
                        }
                    }

                    // Restore the current page if we have enough data
                    if (this.allResources.length > currentPage * ResourcesPerPage) {
                        this.currentPage = currentPage
                    } else {
                        // If we don't have enough data, go to the last available page
                        this.currentPage = Math.max(0, Math.ceil(this.allResources.length / ResourcesPerPage) - 1)
                    }

                    this._view.webview.html = this.getHtmlContent()
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

    private getHtmlContent(): string {
        const start = this.currentPage * ResourcesPerPage
        const end = start + ResourcesPerPage
        const pageResources = this.allResources.slice(start, end)
        const totalPages = Math.ceil(this.allResources.length / ResourcesPerPage)
        const hasMore = this.nextToken !== undefined

        if (!pageResources || pageResources.length === 0) {
            return `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            font-family: var(--vscode-font-family);
                            margin: 8px;
                            background-color: var(--vscode-panel-background);
                            color: var(--vscode-panel-foreground);
                        }
                    </style>
                </head>
                <body>
                    <p>No resources found for stack: ${this.stackName}</p>
                </body>
                </html>
            `
        }

        const paginationControls = `
            <div style="margin-bottom: 10px; display: flex; gap: 8px; align-items: center; justify-content: flex-end;">
                ${
                    totalPages > 1 || hasMore
                        ? `
                    <button onclick="prevPage()" ${this.currentPage === 0 ? 'disabled' : ''}>Previous</button>
                    <button onclick="nextPage()" ${this.currentPage >= totalPages - 1 && !hasMore ? 'disabled' : ''}>Next</button>
                `
                        : ''
                }
            </div>
        `

        let tableHtml = `
            <table style="width: 100%; border-collapse: collapse; border: 1px solid var(--vscode-panel-border);">
                <tr>
                    <th style="width: 25%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">Logical ID</th>
                    <th style="width: 25%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">Physical ID</th>
                    <th style="width: 25%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">Type</th>
                    <th style="width: 25%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">Status</th>
                </tr>
        `

        for (const resource of pageResources) {
            tableHtml += `<tr style="color: var(--vscode-foreground);">
                <td style="width: 25%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;">${resource.LogicalResourceId}</td>
                <td style="width: 25%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;">${resource.PhysicalResourceId || ' '}</td>
                <td style="width: 25%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;">${resource.ResourceType}</td>
                <td style="width: 25%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px;">${resource.ResourceStatus}</td>
            </tr>`
        }

        tableHtml += '</table>'

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        margin: 8px;
                        background-color: var(--vscode-panel-background);
                        color: var(--vscode-panel-foreground);
                    }
                    button {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 4px 8px;
                        cursor: pointer;
                        border-radius: 2px;
                    }
                    button:hover { background: var(--vscode-button-hoverBackground); }
                    button:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }
                </style>
            </head>
            <body>
                ${paginationControls}
                ${tableHtml}
                <script>
                    const vscode = acquireVsCodeApi();
                    function nextPage() { vscode.postMessage({ command: 'nextPage' }); }
                    function prevPage() { vscode.postMessage({ command: 'prevPage' }); }
                </script>
            </body>
            </html>
        `
    }
}
