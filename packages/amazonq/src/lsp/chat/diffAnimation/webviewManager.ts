/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { getLogger } from 'aws-core-vscode/shared'
import { WebviewMessage } from './types'

export class WebviewManager implements vscode.Disposable {
    private diffWebviews = new Map<string, vscode.WebviewPanel>()
    // Auto-scroll control
    private shouldAutoScroll = new Map<string, boolean>()
    private lastScrollPosition = new Map<string, number>()

    constructor() {
        getLogger().info('[WebviewManager] 🚀 Initialized webview manager')
    }

    /**
     * Get or create a webview panel for diff display
     */
    public async getOrCreateDiffWebview(filePath: string): Promise<vscode.WebviewPanel> {
        // Check if we already have a webview for this file
        let webview = this.diffWebviews.get(filePath)
        if (webview) {
            // Reveal existing webview
            webview.reveal(vscode.ViewColumn.One)
            return webview
        }

        // Create new webview that will take over the editor area
        const fileName = path.basename(filePath)
        webview = vscode.window.createWebviewPanel('amazonQDiff', `Diff: ${fileName}`, vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [],
        })

        // Store webview
        this.diffWebviews.set(filePath, webview)

        // Initialize scroll control
        this.shouldAutoScroll.set(filePath, true)
        this.lastScrollPosition.set(filePath, 0)

        // Handle webview disposal
        webview.onDidDispose(() => {
            this.diffWebviews.delete(filePath)
            this.shouldAutoScroll.delete(filePath)
            this.lastScrollPosition.delete(filePath)
            // Reopen the original file editor after webview is disposed
            Promise.resolve(
                vscode.workspace.openTextDocument(vscode.Uri.file(filePath)).then((doc) => {
                    void vscode.window.showTextDocument(doc, {
                        preview: false,
                        viewColumn: vscode.ViewColumn.One,
                    })
                })
            ).catch((error) => {
                getLogger().error(`[WebviewManager] Failed to reopen file after webview disposal: ${error}`)
            })
        })

        // Handle messages from webview (including scroll events)
        webview.webview.onDidReceiveMessage((message) => {
            this.handleWebviewMessage(filePath, message)
        })

        // Set initial HTML
        webview.webview.html = this.getDiffWebviewContent()

        return webview
    }

    /**
     * Handle messages from webview
     */
    private handleWebviewMessage(filePath: string, message: WebviewMessage): void {
        if (message.command === 'userScrolled') {
            const currentPosition = message.scrollTop
            const lastPosition = this.lastScrollPosition.get(filePath) || 0

            // If user scrolled up, disable auto-scroll
            if (currentPosition < lastPosition - 50) {
                // 50px threshold
                this.shouldAutoScroll.set(filePath, false)
                getLogger().info(`[WebviewManager] Auto-scroll disabled for: ${filePath}`)
            }

            this.lastScrollPosition.set(filePath, currentPosition)
        }
    }

    /**
     * Check if auto-scroll is enabled for a file
     */
    public shouldAutoScrollForFile(filePath: string): boolean {
        return this.shouldAutoScroll.get(filePath) !== false
    }

    /**
     * Send message to webview
     */
    public async sendMessageToWebview(filePath: string, message: WebviewMessage): Promise<void> {
        const webview = this.diffWebviews.get(filePath)
        if (webview) {
            await webview.webview.postMessage(message)
        }
    }

    /**
     * Close diff webview for a file
     */
    public closeDiffWebview(filePath: string): void {
        const webview = this.diffWebviews.get(filePath)
        if (webview) {
            webview.dispose()
            this.diffWebviews.delete(filePath)
        }
        this.shouldAutoScroll.delete(filePath)
        this.lastScrollPosition.delete(filePath)
    }

    /**
     * Get the HTML content for the diff webview
     */
    private getDiffWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Diff View</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace;
            font-size: 13px;
            line-height: 1.5;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        
        .diff-container {
            display: flex;
            height: 100vh;
            overflow: hidden;
        }
        
        .diff-pane {
            flex: 1;
            overflow-y: auto;
            overflow-x: auto;
            position: relative;
        }
        
        .diff-pane.left {
            border-right: 1px solid var(--vscode-panel-border);
        }
        
        .diff-header {
            position: sticky;
            top: 0;
            background: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding: 8px 16px;
            font-weight: bold;
            z-index: 10;
        }
        
        .diff-content {
            padding: 8px 0;
            min-height: 100%;
        }
        
        .diff-line {
            display: flex;
            align-items: stretch;
            min-height: 20px;
            white-space: pre;
            position: relative;
            opacity: 0;
            transform: translateY(2px);
            transition: opacity 0.2s ease, transform 0.2s ease;
        }
        
        /* Line becomes visible when added */
        .diff-line.visible {
            opacity: 1;
            transform: translateY(0);
        }
        
        .line-number {
            width: 50px;
            text-align: right;
            padding-right: 12px;
            color: var(--vscode-editorLineNumber-foreground);
            user-select: none;
            flex-shrink: 0;
        }
        
        .line-content {
            flex: 1;
            padding-left: 16px;
            padding-right: 16px;
        }
        
        /* Yellow scanning highlight - Cline style */
        .diff-line.scanning {
            background-color: rgba(255, 255, 0, 0.3) !important;
            border: 1px solid rgba(255, 255, 0, 0.5);
            box-shadow: 0 0 8px rgba(255, 255, 0, 0.3);
        }
        
        /* GitHub-style diff decorations */
        .diff-line.visible.added {
            background-color: rgba(46, 160, 67, 0.15);
        }
        
        .diff-line.visible.added::before {
            content: '+';
            position: absolute;
            left: 8px;
            color: rgb(46, 160, 67);
            font-weight: bold;
        }
        
        .diff-line.visible.removed {
            background-color: rgba(248, 81, 73, 0.15);
        }
        
        .diff-line.visible.removed::before {
            content: '-';
            position: absolute;
            left: 8px;
            color: rgb(248, 81, 73);
            font-weight: bold;
        }
        
        .diff-line.visible.removed .line-content {
            text-decoration: line-through;
            opacity: 0.7;
        }
        
        .diff-line.visible.unchanged {
            color: var(--vscode-editor-foreground);
        }
        
        /* Loading state */
        .loading {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
        
        /* Scanning indicator */
        .scanning-indicator {
            position: fixed;
            top: 50px;
            right: 20px;
            padding: 8px 16px;
            background: rgba(255, 255, 0, 0.2);
            border: 1px solid rgba(255, 255, 0, 0.5);
            border-radius: 4px;
            font-size: 12px;
            z-index: 100;
            display: none;
        }
        
        .scanning-indicator.active {
            display: block;
        }
    </style>
</head>
<body>
    <div class="diff-container">
        <div class="diff-pane left" id="left-pane">
            <div class="diff-header">Original</div>
            <div class="diff-content" id="left-content">
                <div class="loading">Scanning changes...</div>
            </div>
        </div>
        <div class="diff-pane right" id="right-pane">
            <div class="diff-header">AI's Changes</div>
            <div class="diff-content" id="right-content">
                <div class="loading">Scanning changes...</div>
            </div>
        </div>
    </div>
    
    <div class="scanning-indicator" id="scanning-indicator">
        Scanning line <span id="scan-progress">0</span>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        let currentScanLine = 0;
        let totalLines = 0;
        let scrollTimeout = null;
        
        // Track scroll events
        document.getElementById('right-pane').addEventListener('scroll', (e) => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                vscode.postMessage({
                    command: 'userScrolled',
                    scrollTop: e.target.scrollTop
                });
            }, 100);
        });
        
        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'startScan':
                    startScan(message.totalLines);
                    break;
                    
                case 'addLine':
                    addLine(message);
                    break;
                    
                case 'scanLine':
                    scanLine(message);
                    break;
                    
                case 'completeScan':
                    completeScan();
                    break;
                    
                case 'clear':
                    clearContent();
                    break;
            }
        });
        
        function startScan(total) {
            totalLines = total;
            currentScanLine = 0;
            
            // Clear loading messages
            document.getElementById('left-content').innerHTML = '';
            document.getElementById('right-content').innerHTML = '';
            
            // Show scanning indicator
            document.getElementById('scanning-indicator').classList.add('active');
        }
        
        function addLine(message) {
            const { side, line, immediately } = message;
            const container = document.getElementById(side + '-content');
            
            const lineEl = createLineElement(line, side);
            container.appendChild(lineEl);
            
            if (immediately) {
                // Show immediately without animation
                setTimeout(() => lineEl.classList.add('visible'), 10);
            }
        }
        
        function createLineElement(line, side) {
            const lineEl = document.createElement('div');
            lineEl.className = 'diff-line ' + line.type;
            lineEl.setAttribute('data-line-index', line.index);
            
            const lineNumEl = document.createElement('span');
            lineNumEl.className = 'line-number';
            lineNumEl.textContent = line[side + 'LineNumber'] || '';
            
            const contentEl = document.createElement('span');
            contentEl.className = 'line-content';
            contentEl.textContent = line.content;
            
            lineEl.appendChild(lineNumEl);
            lineEl.appendChild(contentEl);
            
            return lineEl;
        }
        
        async function scanLine(message) {
            const { leftIndex, rightIndex, autoScroll } = message;
            currentScanLine++;
            
            // Update progress
            document.getElementById('scan-progress').textContent = currentScanLine + '/' + totalLines;
            
            // Find lines to scan
            const leftLine = leftIndex !== undefined 
                ? document.querySelector('#left-content .diff-line[data-line-index="' + leftIndex + '"]')
                : undefined;
            const rightLine = rightIndex !== undefined
                ? document.querySelector('#right-content .diff-line[data-line-index="' + rightIndex + '"]')
                : undefined;
            
            // Apply scanning highlight
            if (leftLine) {
                leftLine.classList.add('scanning', 'visible');
            }
            if (rightLine) {
                rightLine.classList.add('scanning', 'visible');
            }
            
            // Auto-scroll if enabled
            if (autoScroll && rightLine) {
                rightLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else if (autoScroll && leftLine) {
                leftLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            
            // Remove scanning highlight after delay
            setTimeout(() => {
                if (leftLine) leftLine.classList.remove('scanning');
                if (rightLine) rightLine.classList.remove('scanning');
            }, 100);
        }
        
        function completeScan() {
            // Hide scanning indicator
            document.getElementById('scanning-indicator').classList.remove('active');
            
            // Ensure all lines are visible
            document.querySelectorAll('.diff-line').forEach(line => {
                line.classList.add('visible');
                line.classList.remove('scanning');
            });
        }
        
        function clearContent() {
            document.getElementById('left-content').innerHTML = '';
            document.getElementById('right-content').innerHTML = '';
            document.getElementById('scanning-indicator').classList.remove('active');
        }
    </script>
</body>
</html>`
    }

    /**
     * Get webview statistics
     */
    public getWebviewStats(): { activeCount: number; filePaths: string[] } {
        return {
            activeCount: this.diffWebviews.size,
            filePaths: Array.from(this.diffWebviews.keys()),
        }
    }

    public dispose(): void {
        getLogger().info('[WebviewManager] 💥 Disposing webview manager')

        // Close all webviews
        for (const [_, webview] of this.diffWebviews) {
            webview.dispose()
        }
        this.diffWebviews.clear()
        this.shouldAutoScroll.clear()
        this.lastScrollPosition.clear()
    }
}
