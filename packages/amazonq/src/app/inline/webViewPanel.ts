/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
/* eslint-disable no-restricted-imports */
import { fs, getLogger } from 'aws-core-vscode/shared'

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
            vscode.commands.registerCommand('aws.amazonq.toggleNextEditPredictionPanel', async () => {
                await this.toggle()
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
    private async setupFileWatcher(): Promise<void> {
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
            if (await fs.exists(this.logFilePath)) {
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
        this.fileReadTimeout = setTimeout(async () => {
            await this.readRequestLogFile()
        }, 1000)
    }

    /**
     * Read the request log file and update the panel content
     */
    private async readRequestLogFile(): Promise<void> {
        getLogger('nextEditPrediction').info(`Attempting to read log file: ${this.logFilePath}`)
        try {
            if (!fs.exists(this.logFilePath)) {
                getLogger('nextEditPrediction').info(`Log file does not exist: ${this.logFilePath}`)
                return
            }

            const content = await fs.readFileText(this.logFilePath)
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

                    // Parse request and response fields if they're JSON stringss
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
    private async updateRequestLogsView(): Promise<void> {
        if (this.panel) {
            this.panel.webview.html = await this.getWebviewContent()
            getLogger('nextEditPrediction').info('Webview panel updated with request logs')
        }
    }

    /**
     * Toggle the panel visibility
     */
    public async toggle(): Promise<void> {
        if (this.isVisible) {
            this.hide()
        } else {
            this.show()
        }
    }

    /**
     * Show the panel
     */
    public async show(): Promise<void> {
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
            this.panel.webview.html = await this.getWebviewContent()

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
    public async updateContent(text: string): Promise<void> {
        if (this.panel) {
            try {
                // Store the text for display in a separate section
                const customContent = text

                // Update the panel with both the custom content and the request logs
                this.panel.webview.html = await this.getWebviewContent(customContent)
                getLogger('nextEditPrediction').info('Webview panel content updated')
            } catch (error) {
                getLogger('nextEditPrediction').error(`Error updating webview: ${error}`)
            }
        }
    }

    /**
     * Generate HTML content for the webview
     */
    private async getWebviewContent(customContent?: string): Promise<string> {
        // Path to the debug.html file
        const debugHtmlPath = vscode.Uri.file(
            vscode.Uri.joinPath(
                vscode.Uri.file(__dirname),
                '..',
                '..',
                '..',
                'app',
                'inline',
                'EditRendering',
                'debug.html'
            ).fsPath
        )

        // Read the HTML file content
        try {
            const htmlContent = await fs.readFileText(debugHtmlPath.fsPath)
            getLogger('nextEditPrediction').info(`Successfully loaded debug.html from ${debugHtmlPath.fsPath}`)

            // Modify the HTML to add vscode API initialization
            return htmlContent.replace(
                '</body>',
                `
                <script>
                    // Initialize vscode API
                    const vscode = acquireVsCodeApi();
                    
                    // Set up message handlers for communication with extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        // Handle messages from extension if needed
                    });
                    
                    // Set up button handlers for clear and refresh
                    document.getElementById('clearBtn')?.addEventListener('click', () => {
                        vscode.postMessage({ command: 'clear' });
                    });
                    
                    document.getElementById('reconnectBtn')?.addEventListener('click', () => {
                        vscode.postMessage({ command: 'refresh' });
                    });
                </script>
            </body>`
            )
        } catch (error) {
            getLogger('nextEditPrediction').error(`Error loading debug.html: ${error}`)
            return `
                <html>
                <body>
                    <h1>Error loading visualization</h1>
                    <p>Failed to load debug.html file: ${error}</p>
                </body>
                </html>
            `
        }
    }

    /**
     * Clear the log file and update the panel
     */
    private async clearLogFile(): Promise<void> {
        try {
            getLogger('nextEditPrediction').info(`Clearing log file: ${this.logFilePath}`)

            // Write an empty string to clear the file
            await fs.writeFile(this.logFilePath, '')

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
