/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
/* eslint-disable no-restricted-imports */
import fs from 'fs'
import { getLogger } from 'aws-core-vscode/shared'

/**
 * Interface for JSON request log data
 */
interface RequestLogEntry {
    timestamp: string
    request: string
    response: string
    endpoint: string
    error: string
    requestId: string
    responseCode: number
    applicationLogs?: {
        rts?: string[]
        ceo?: string[]
        [key: string]: string[] | undefined
    }
    latency?: number
    latencyBreakdown?: {
        rts?: number
        ceo?: number
        [key: string]: number | undefined
    }
    miscellaneous?: any
}

/**
 * Manages the webview panel for displaying insert text content and request logs
 */
export class NextEditPredictionPanel implements vscode.Disposable {
    public static readonly viewType = 'nextEditPrediction'

    private static instance: NextEditPredictionPanel | undefined
    private panel: vscode.WebviewPanel | undefined
    private disposables: vscode.Disposable[] = []
    private statusBarItem: vscode.StatusBarItem
    private isVisible = false
    private fileWatcher: vscode.FileSystemWatcher | undefined
    private requestLogs: RequestLogEntry[] = []
    private logFilePath = '/tmp/request_log.jsonl'
    private fileReadTimeout: NodeJS.Timeout | undefined

    private constructor() {
        // Create status bar item - higher priority (1) to ensure visibility
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1)
        this.statusBarItem.text = '$(eye) NEP' // Add icon for better visibility
        this.statusBarItem.tooltip = 'Toggle Next Edit Prediction Panel'
        this.statusBarItem.command = 'aws.amazonq.toggleNextEditPredictionPanel'
        this.statusBarItem.show()

        // Register command for toggling the panel
        this.disposables.push(
            vscode.commands.registerCommand('aws.amazonq.toggleNextEditPredictionPanel', () => {
                this.toggle()
            })
        )
    }

    /**
     * Get or create the NextEditPredictionPanel instance
     */
    public static getInstance(): NextEditPredictionPanel {
        if (!NextEditPredictionPanel.instance) {
            NextEditPredictionPanel.instance = new NextEditPredictionPanel()
        }
        return NextEditPredictionPanel.instance
    }

    /**
     * Setup file watcher to monitor the request log file
     */
    private setupFileWatcher(): void {
        if (this.fileWatcher) {
            return
        }

        try {
            // Create the watcher for the specific file
            this.fileWatcher = vscode.workspace.createFileSystemWatcher(this.logFilePath)

            // When file is changed, read it after a delay
            this.fileWatcher.onDidChange(() => {
                this.scheduleFileRead()
            })

            // When file is created, read it after a delay
            this.fileWatcher.onDidCreate(() => {
                this.scheduleFileRead()
            })

            this.disposables.push(this.fileWatcher)

            // Initial read of the file if it exists
            if (fs.existsSync(this.logFilePath)) {
                this.scheduleFileRead()
            }

            getLogger('nextEditPrediction').info(`File watcher set up for ${this.logFilePath}`)
        } catch (error) {
            getLogger('nextEditPrediction').error(`Error setting up file watcher: ${error}`)
        }
    }

    /**
     * Schedule file read with a delay to ensure file is fully written
     */
    private scheduleFileRead(): void {
        // Clear any existing timeout
        if (this.fileReadTimeout) {
            clearTimeout(this.fileReadTimeout)
        }

        // Schedule new read after 1 second delay
        this.fileReadTimeout = setTimeout(() => {
            this.readRequestLogFile()
        }, 1000)
    }

    /**
     * Read the request log file and update the panel content
     */
    private readRequestLogFile(): void {
        getLogger('nextEditPrediction').info(`Attempting to read log file: ${this.logFilePath}`)
        try {
            if (!fs.existsSync(this.logFilePath)) {
                getLogger('nextEditPrediction').info(`Log file does not exist: ${this.logFilePath}`)
                return
            }

            const content = fs.readFileSync(this.logFilePath, 'utf8')
            this.requestLogs = []

            // Process JSONL format (one JSON object per line)
            const lines = content.split('\n').filter((line: string) => line.trim() !== '')
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim()
                try {
                    // Try to parse the JSON, handling potential trailing characters
                    let jsonString = line

                    // Find the last valid JSON by looking for the last closing brace/bracket
                    const lastClosingBrace = line.lastIndexOf('}')
                    const lastClosingBracket = line.lastIndexOf(']')
                    const lastValidChar = Math.max(lastClosingBrace, lastClosingBracket)

                    if (lastValidChar > 0 && lastValidChar < line.length - 1) {
                        // If there are characters after the last valid JSON ending, trim them
                        jsonString = line.substring(0, lastValidChar + 1)
                        getLogger('nextEditPrediction').info(`Trimmed extra characters from line ${i + 1}`)
                    }

                    // Step 1: Parse the JSON string to get an object
                    const parsed = JSON.parse(jsonString)
                    // Step 2: Stringify the object to normalize it
                    const normalized = JSON.stringify(parsed)
                    // Step 3: Parse the normalized string back to an object
                    const logEntry = JSON.parse(normalized) as RequestLogEntry

                    // Parse request and response fields if they're JSON strings
                    if (typeof logEntry.request === 'string') {
                        try {
                            // Apply the same double-parse technique to nested JSON
                            const requestObj = JSON.parse(logEntry.request)
                            const requestNormalized = JSON.stringify(requestObj)
                            logEntry.request = JSON.parse(requestNormalized)
                        } catch (e) {
                            // Keep as string if it's not valid JSON
                            getLogger('nextEditPrediction').info(`Could not parse request as JSON: ${e}`)
                        }
                    }

                    if (typeof logEntry.response === 'string') {
                        try {
                            // Apply the same double-parse technique to nested JSON
                            const responseObj = JSON.parse(logEntry.response)
                            const responseNormalized = JSON.stringify(responseObj)
                            logEntry.response = JSON.parse(responseNormalized)
                        } catch (e) {
                            // Keep as string if it's not valid JSON
                            getLogger('nextEditPrediction').info(`Could not parse response as JSON: ${e}`)
                        }
                    }

                    this.requestLogs.push(logEntry)
                } catch (e) {
                    getLogger('nextEditPrediction').error(`Error parsing log entry ${i + 1}: ${e}`)
                    getLogger('nextEditPrediction').error(
                        `Problematic line: ${line.length > 100 ? line.substring(0, 100) + '...' : line}`
                    )
                }
            }

            if (this.isVisible && this.panel) {
                this.updateRequestLogsView()
            }

            getLogger('nextEditPrediction').info(`Read ${this.requestLogs.length} log entries`)
        } catch (error) {
            getLogger('nextEditPrediction').error(`Error reading log file: ${error}`)
        }
    }

    /**
     * Update the panel with request logs data
     */
    private updateRequestLogsView(): void {
        if (this.panel) {
            this.panel.webview.html = this.getWebviewContent()
            getLogger('nextEditPrediction').info('Webview panel updated with request logs')
        }
    }

    /**
     * Toggle the panel visibility
     */
    public toggle(): void {
        if (this.isVisible) {
            this.hide()
        } else {
            this.show()
        }
    }

    /**
     * Show the panel
     */
    private show(): void {
        if (!this.panel) {
            // Create the webview panel
            this.panel = vscode.window.createWebviewPanel(
                NextEditPredictionPanel.viewType,
                'Next Edit Prediction',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                }
            )

            // Set initial content
            this.panel.webview.html = this.getWebviewContent()

            // Handle panel disposal
            this.panel.onDidDispose(
                () => {
                    this.panel = undefined
                    this.isVisible = false
                    this.updateStatusBarItem()
                },
                undefined,
                this.disposables
            )

            // Handle webview messages
            this.panel.webview.onDidReceiveMessage(
                (message) => {
                    switch (message.command) {
                        case 'refresh':
                            getLogger('nextEditPrediction').info(`Refresh button clicked`)
                            this.readRequestLogFile()
                            break
                        case 'clear':
                            getLogger('nextEditPrediction').info(`Clear logs button clicked`)
                            this.clearLogFile()
                            break
                    }
                },
                undefined,
                this.disposables
            )
        } else {
            this.panel.reveal()
        }

        this.isVisible = true
        this.updateStatusBarItem()

        // Setup file watcher when panel is shown
        this.setupFileWatcher()

        // If we already have logs, update the view
        if (this.requestLogs.length > 0) {
            this.updateRequestLogsView()
        } else {
            // Try to read the log file
            this.scheduleFileRead()
        }
    }

    /**
     * Hide the panel
     */
    private hide(): void {
        if (this.panel) {
            this.panel.dispose()
            this.panel = undefined
            this.isVisible = false
            this.updateStatusBarItem()
        }
    }

    /**
     * Update the status bar item appearance based on panel state
     */
    private updateStatusBarItem(): void {
        if (this.isVisible) {
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
        } else {
            this.statusBarItem.backgroundColor = undefined
        }
    }

    /**
     * Update the panel content with new text
     */
    public updateContent(text: string): void {
        if (this.panel) {
            try {
                // Store the text for display in a separate section
                const customContent = text

                // Update the panel with both the custom content and the request logs
                this.panel.webview.html = this.getWebviewContent(customContent)
                getLogger('nextEditPrediction').info('Webview panel content updated')
            } catch (error) {
                getLogger('nextEditPrediction').error(`Error updating webview: ${error}`)
            }
        }
    }

    /**
     * Generate HTML content for the webview
     */
    private getWebviewContent(customContent?: string): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Next Edit Prediction</title>
            <style>
                body {
                    font-family: var(--vscode-editor-font-family);
                    font-size: var(--vscode-editor-font-size);
                    padding: 10px;
                    color: var(--vscode-editor-foreground);
                    background-color: var(--vscode-editor-background);
                }
                .timestamp {
                    font-size: 12px;
                    color: var(--vscode-editorLineNumber-foreground);
                    margin-bottom: 10px;
                }
                .content {
                    white-space: pre-wrap;
                    font-family: var(--vscode-editor-font-family);
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 10px;
                    border-radius: 3px;
                    overflow: auto;
                    margin-bottom: 20px;
                }
                h3 {
                    margin-top: 0;
                    color: var(--vscode-editorLightBulb-foreground);
                }
                .section {
                    margin-bottom: 20px;
                }
                details {
                    margin-bottom: 10px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 3px;
                }
                details summary {
                    padding: 8px;
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    cursor: pointer;
                }
                details .details-content {
                    padding: 8px;
                }
                .request-meta {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                    margin-bottom: 8px;
                    font-size: 12px;
                }
                .request-meta div {
                    background-color: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    padding: 2px 6px;
                    border-radius: 3px;
                }
                .error {
                    color: var(--vscode-errorForeground);
                }
                .json-key {
                    color: var(--vscode-debugTokenExpression-name);
                }
                .json-string {
                    color: var(--vscode-debugTokenExpression-string);
                }
                .json-number {
                    color: var(--vscode-debugTokenExpression-number);
                }
                .json-boolean {
                    color: var(--vscode-debugTokenExpression-boolean);
                }
                .json-null {
                    color: var(--vscode-debugTokenExpression-error);
                }
                .tabs {
                    display: flex;
                    margin-bottom: 10px;
                }
                .tab {
                    padding: 5px 10px;
                    cursor: pointer;
                    background-color: var(--vscode-tab-inactiveBackground);
                    color: var(--vscode-tab-inactiveForeground);
                    border: 1px solid var(--vscode-panel-border);
                    border-bottom: none;
                    border-radius: 3px 3px 0 0;
                    margin-right: 5px;
                }
                .tab.active {
                    background-color: var(--vscode-tab-activeBackground);
                    color: var(--vscode-tab-activeForeground);
                    border-bottom: 1px solid var(--vscode-tab-activeBackground);
                }
                .tab-content {
                    display: none;
                    border: 1px solid var(--vscode-panel-border);
                    padding: 10px;
                    border-radius: 0 3px 3px 3px;
                }
                .tab-content.active {
                    display: block;
                }
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 5px 10px;
                    border-radius: 3px;
                    cursor: pointer;
                    margin-bottom: 10px;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
            </style>
        </head>
        <body>
            <h3>Next Edit Prediction</h3>
            <div class="timestamp">Updated: ${new Date().toLocaleTimeString()}</div>
            <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                <button id="refresh">Refresh Logs</button>
                <button id="clear">Clear Logs</button>
            </div>

            <div class="tabs">
                <div class="tab active" data-tab="content">Content</div>
                <div class="tab" data-tab="logs">Request Logs (${this.requestLogs.length})</div>
            </div>

            <div id="content-tab" class="tab-content active">
                <div class="content">${customContent ? this.escapeHtml(customContent) : 'No prediction data yet'}</div>
            </div>

            <div id="logs-tab" class="tab-content">
                <div class="section request-logs">
                    ${this.generateRequestLogsHtml()}
                </div>
            </div>

            <script>
                // Function to toggle JSON collapse/expand
                function setupCollapsibles() {
                    // Setup tab switching
                    const tabs = document.querySelectorAll('.tab');
                    const tabContents = document.querySelectorAll('.tab-content');
                    
                    tabs.forEach(tab => {
                        tab.addEventListener('click', () => {
                            const tabName = tab.getAttribute('data-tab');
                            
                            // Make all tabs inactive
                            tabs.forEach(t => t.classList.remove('active'));
                            tabContents.forEach(content => content.classList.remove('active'));
                            
                            // Make selected tab active
                            tab.classList.add('active');
                            document.getElementById(tabName + '-tab').classList.add('active');
                        });
                    });

                    // Setup refresh button
                    document.getElementById('refresh').addEventListener('click', () => {
                        // Send message to extension
                        vscode.postMessage({
                            command: 'refresh'
                        });
                    });
                    
                    // Setup clear logs button
                    document.getElementById('clear').addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'clear'
                        });
                    });
                }

                // Initialize collapsible elements when the page loads
                document.addEventListener('DOMContentLoaded', setupCollapsibles);
                
                // Initialize vscode API
                const vscode = acquireVsCodeApi();
                
                // Call setup immediately as we might be loading after DOMContentLoaded
                setupCollapsibles();
            </script>
        </body>
        </html>`
    }

    /**
     * Generate HTML for the request logs
     */
    private generateRequestLogsHtml(): string {
        if (this.requestLogs.length === 0) {
            return '<div>No request logs available.</div>'
        }

        let html = ''

        // Display each request log as a collapsible section
        for (let i = 0; i < this.requestLogs.length; i++) {
            const log = this.requestLogs[i]
            const date = new Date(log.timestamp).toLocaleString()
            const status = log.responseCode === 200 ? 'Succeeded' : 'Failed'

            html += `
            <details>
                <summary>Request ${i + 1} --- id: ${log.requestId || 'N/A'} --- status: ${status}</summary>
                <div class="details-content">
                    <div class="request-meta">
                        <div>Time: ${date}</div>
                        <div>Request ID: ${log.requestId || 'N/A'}</div>
                        <div>Status: ${log.responseCode || 'N/A'} (${status})</div>
                        ${log.latency ? `<div>Latency: ${log.latency}ms</div>` : ''}
                        ${log.error ? `<div class="error">Error: ${this.escapeHtml(log.error)}</div>` : ''}
                    </div>
                    
                    <details>
                        <summary>Request</summary>
                        <div class="details-content">
                            <pre class="content">${this.escapeHtml(JSON.stringify(log.request, undefined, 2))}</pre>
                        </div>
                    </details>
                    
                    <details>
                        <summary>Response</summary>
                        <div class="details-content">
                            <pre class="content">${this.escapeHtml(JSON.stringify(log.response, undefined, 2))}</pre>
                        </div>
                    </details>
                    
                    ${this.generateMiscellaneousHtml(log, i)}
                </div>
            </details>`
        }

        return html
    }

    /**
     * Generate HTML for application logs
     */
    /**
     * Clear the log file and update the panel
     */
    private clearLogFile(): void {
        try {
            getLogger('nextEditPrediction').info(`Clearing log file: ${this.logFilePath}`)

            // Write an empty string to clear the file
            fs.writeFileSync(this.logFilePath, '')

            // Clear the in-memory logs
            this.requestLogs = []

            // Update the view
            if (this.isVisible && this.panel) {
                this.updateRequestLogsView()
            }

            getLogger('nextEditPrediction').info(`Log file cleared successfully`)
        } catch (error) {
            getLogger('nextEditPrediction').error(`Error clearing log file: ${error}`)
        }
    }

    /**
     * Format JSON object as HTML with syntax highlighting
     */
    private formatJsonHtml(obj: any): string {
        if (obj === null) {
            return '<span class="json-null">null</span>'
        }

        if (obj === undefined) {
            return '<span class="json-null">undefined</span>'
        }

        if (typeof obj === 'boolean') {
            return `<span class="json-boolean">${obj}</span>`
        }

        if (typeof obj === 'number') {
            return `<span class="json-number">${obj}</span>`
        }

        if (typeof obj === 'string') {
            return `<span class="json-string">"${this.escapeHtml(obj)}"</span>`
        }

        if (Array.isArray(obj)) {
            if (obj.length === 0) {
                return '[]'
            }

            let html = '['
            for (let i = 0; i < obj.length; i++) {
                html += '<details open><summary>Item ' + i + '</summary><div class="details-content">'
                html += this.formatJsonHtml(obj[i])
                html += '</div></details>'

                if (i < obj.length - 1) {
                    html += ', '
                }
            }
            html += ']'
            return html
        }

        if (typeof obj === 'object') {
            const keys = Object.keys(obj)
            if (keys.length === 0) {
                return '{}'
            }

            let html = '{'
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i]
                html += '<details open><summary>'
                html += `<span class="json-key">"${this.escapeHtml(key)}"</span>:`
                html += '</summary><div class="details-content">'
                html += this.formatJsonHtml(obj[key])
                html += '</div></details>'

                if (i < keys.length - 1) {
                    html += ', '
                }
            }
            html += '}'
            return html
        }

        return this.escapeHtml(String(obj))
    }

    /**
     * Generate HTML for miscellaneous field in the log entry
     */
    private generateMiscellaneousHtml(log: RequestLogEntry, index: number): string {
        // Only check for the specific "miscellaneous" field
        if (!log.miscellaneous) {
            return ''
        }

        return `
        <details>
            <summary>Miscellaneous</summary>
            <div class="details-content">
                <div class="content">${this.formatJsonHtml(log.miscellaneous)}</div>
            </div>
        </details>`
    }

    /**
     * Escape HTML characters to prevent XSS
     */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        if (this.panel) {
            this.panel.dispose()
        }

        if (this.fileWatcher) {
            this.fileWatcher.dispose()
        }

        if (this.fileReadTimeout) {
            clearTimeout(this.fileReadTimeout)
        }

        this.statusBarItem.dispose()

        for (const d of this.disposables) {
            d.dispose()
        }
        this.disposables = []

        NextEditPredictionPanel.instance = undefined
    }
}
