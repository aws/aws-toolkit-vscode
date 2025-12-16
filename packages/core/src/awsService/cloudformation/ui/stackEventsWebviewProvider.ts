/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebviewView, WebviewViewProvider, Disposable } from 'vscode'
import { StackEvent } from '@aws-sdk/client-cloudformation'
import { LanguageClient } from 'vscode-languageclient/node'
import { extractErrorMessage, getStackStatusClass, isStackInTransientState } from '../utils'
import { GetStackEventsRequest, ClearStackEventsRequest } from '../stacks/actions/stackActionProtocol'
import { StackViewCoordinator } from './stackViewCoordinator'
import { arnToConsoleTabUrl, externalLinkSvg, consoleLinkStyles } from '../consoleLinksUtils'

const EventsPerPage = 50
const RefreshIntervalMs = 5000

export class StackEventsWebviewProvider implements WebviewViewProvider, Disposable {
    private view?: WebviewView
    private stackName?: string
    private stackArn?: string
    private allEvents: StackEvent[] = []
    private currentPage = 0
    private nextToken?: string
    private refreshTimer?: NodeJS.Timeout
    private readonly disposables: Disposable[] = []
    private readonly coordinatorSubscription: Disposable

    constructor(
        private readonly client: LanguageClient,
        coordinator: StackViewCoordinator
    ) {
        this.coordinatorSubscription = coordinator.onDidChangeStack(async (state) => {
            try {
                if (state.stackName && !state.isChangeSetMode) {
                    this.stopAutoRefresh()
                    this.stackArn = state.stackArn
                    await this.showStackEvents(state.stackName)
                } else if (!state.stackName || state.isChangeSetMode) {
                    this.stopAutoRefresh()
                    this.stackName = undefined
                    this.stackArn = undefined
                    this.allEvents = []
                    this.render()
                }

                if (state.stackStatus && !isStackInTransientState(state.stackStatus)) {
                    this.stopAutoRefresh()
                }
            } catch (error) {
                // Silently handle errors to prevent breaking the coordinator
            }
        })
    }

    async showStackEvents(stackName: string): Promise<void> {
        this.stackName = stackName
        this.allEvents = []
        this.currentPage = 0
        this.nextToken = undefined

        try {
            const result = await this.client.sendRequest(GetStackEventsRequest, {
                stackName: this.stackName,
            })
            this.allEvents = result.events
            this.nextToken = result.nextToken
        } catch (error) {
            this.renderError(`Failed to load events: ${extractErrorMessage(error)}`)
        }

        this.render()
        this.startAutoRefresh()
    }

    resolveWebviewView(webviewView: WebviewView): void {
        this.view = webviewView
        webviewView.webview.options = { enableScripts: true }
        webviewView.onDidDispose(() => {
            this.stopAutoRefresh()
        })
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.render()
                this.startAutoRefresh()
            } else {
                this.stopAutoRefresh()
            }
        })

        webviewView.webview.onDidReceiveMessage(async (message: { command: string }) => {
            if (message.command === 'nextPage') {
                await this.nextPage()
            } else if (message.command === 'prevPage') {
                await this.prevPage()
            }
        })

        this.render()
    }

    dispose(): void {
        this.stopAutoRefresh()
        if (this.stackName) {
            void this.client.sendRequest(ClearStackEventsRequest, { stackName: this.stackName })
        }
        for (const d of this.disposables) {
            d.dispose()
        }
        this.coordinatorSubscription.dispose()
    }

    private async loadEvents(): Promise<void> {
        if (!this.stackName || !this.nextToken) {
            return
        }

        try {
            const result = await this.client.sendRequest(GetStackEventsRequest, {
                stackName: this.stackName,
                nextToken: this.nextToken,
            })

            this.allEvents.push(...result.events)
            this.nextToken = result.nextToken
        } catch (error) {
            this.renderError(`Failed to load events: ${extractErrorMessage(error)}`)
        }
    }

    private async refresh(): Promise<void> {
        if (!this.stackName) {
            return
        }

        try {
            const result = await this.client.sendRequest(GetStackEventsRequest, {
                stackName: this.stackName,
                refresh: true,
            })

            if (result.gapDetected) {
                const initialResult = await this.client.sendRequest(GetStackEventsRequest, {
                    stackName: this.stackName,
                })
                this.allEvents = initialResult.events
                this.nextToken = initialResult.nextToken
                this.currentPage = 0
                this.render('Event history reloaded due to high activity')
            } else if (result.events.length > 0) {
                this.allEvents.unshift(...result.events)
                this.currentPage = 0
                this.render()
            }
        } catch (error) {
            this.renderError(`Failed to refresh events: ${extractErrorMessage(error)}`)
        }
    }

    private async nextPage(): Promise<void> {
        const totalPages = Math.ceil(this.allEvents.length / EventsPerPage)
        const nextPageIndex = this.currentPage + 1

        if (nextPageIndex < totalPages) {
            this.currentPage = nextPageIndex
            this.render()
        } else if (this.nextToken) {
            await this.loadEvents()
            this.currentPage = nextPageIndex
            this.render()
        }
    }

    private async prevPage(): Promise<void> {
        if (this.currentPage > 0) {
            this.currentPage--
            this.render()
        } else {
            await this.refresh()
        }
    }

    private startAutoRefresh(): void {
        this.stopAutoRefresh()
        this.refreshTimer = setInterval(() => void this.refresh(), RefreshIntervalMs)
    }

    private stopAutoRefresh(): void {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer)
            this.refreshTimer = undefined
        }
    }

    private renderError(message: string): void {
        if (!this.view || this.view.visible === false) {
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

    private render(notification?: string): void {
        if (!this.view || this.view.visible === false) {
            return
        }

        const start = this.currentPage * EventsPerPage
        const end = start + EventsPerPage
        const pageEvents = this.allEvents.slice(start, end)
        const totalPages = Math.ceil(this.allEvents.length / EventsPerPage)
        const hasMore = this.nextToken !== undefined

        this.view.webview.html = this.getHtml(
            pageEvents,
            this.currentPage + 1,
            totalPages,
            hasMore,
            this.allEvents.length,
            notification
        )
    }

    private getHtml(
        events: StackEvent[],
        currentPage: number,
        totalPages: number,
        hasMore: boolean,
        totalEvents: number,
        notification?: string
    ): string {
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
        .event-count {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .pagination {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 12px;
            cursor: pointer;
            border-radius: 2px;
        }
        button:hover { background: var(--vscode-button-hoverBackground); }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
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
            top: 56px;
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
        .status-complete { color: #28a745; }
        .status-failed { color: #dc3545; }
        .status-progress { color: #ffc107; }
        .notification {
            background: var(--vscode-inputValidation-warningBackground);
            border: 1px solid var(--vscode-inputValidation-warningBorder);
            color: var(--vscode-inputValidation-warningForeground);
            padding: 8px 12px;
            margin: 8px;
            border-radius: 3px;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-content">
            <div class="stack-info">
                ${this.stackName ?? ''}
                ${this.stackArn ? `<a href="${arnToConsoleTabUrl(this.stackArn, 'events')}" class="console-link" title="View in AWS Console">${externalLinkSvg()}</a>` : ''}
                <span class="event-count">(${totalEvents} events${hasMore ? ' loaded' : ''})</span>
            </div>
            <div class="pagination">
                <span>Page ${currentPage} of ${totalPages || 1}</span>
                <button onclick="prevPage()" ${currentPage === 1 ? 'disabled' : ''}>Previous</button>
                <button onclick="nextPage()" ${currentPage >= totalPages && !hasMore ? 'disabled' : ''}>${currentPage >= totalPages && hasMore ? 'Load More' : 'Next'}</button>
            </div>
        </div>
    </div>
    ${notification ? `<div class="notification">${notification}</div>` : ''}
    <div class="table-container">
    <table>
        <thead>
            <tr>
                <th>Timestamp</th>
                <th>Resource</th>
                <th>Type</th>
                <th>Status</th>
                <th>Reason</th>
            </tr>
        </thead>
        <tbody>
        ${events
            .map(
                (e) => `
            <tr>
                <td>${e.Timestamp ? new Date(e.Timestamp).toLocaleString() : '-'}</td>
                <td>${e.LogicalResourceId ?? '-'}</td>
                <td>${e.ResourceType ?? '-'}</td>
                <td class="${getStackStatusClass(e.ResourceStatus)}">${e.ResourceStatus ?? '-'}</td>
                <td>${e.ResourceStatusReason ?? '-'}</td>
            </tr>
        `
            )
            .join('')}
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
}
