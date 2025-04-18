/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import { FileSnapshot, PredictionTracker } from './PredictionTracker'

/**
 * Snapshot visualizer for developers to debug file tracking
 */
export class SnapshotVisualizer {
    public static readonly viewType = 'amazonQ.nextEditPrediction.SnapshotVisualizer'
    private panel: vscode.WebviewPanel | undefined
    private readonly predictionTracker: PredictionTracker

    constructor(
        private readonly extensionContext: vscode.ExtensionContext,
        predictionTracker: PredictionTracker
    ) {
        this.predictionTracker = predictionTracker
    }

    /**
     * Shows the snapshot visualizer panel
     */
    public show(): void {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside)
            return
        }

        this.panel = vscode.window.createWebviewPanel(
            SnapshotVisualizer.viewType,
            'File Snapshot Visualizer',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.file(this.extensionContext.extensionPath)],
            }
        )

        this.panel.webview.html = this.getWebviewContent()

        // Message handling
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'refresh':
                        this.updateContent()
                        break
                    case 'showSnapshot':
                        await this.showSnapshotContent(message.filePath, message.timestamp)
                        break
                    case 'fireAPI':
                        await this.generateDiffs()
                        break
                }
            },
            undefined,
            this.extensionContext.subscriptions
        )

        this.panel.onDidDispose(
            () => {
                this.panel = undefined
            },
            undefined,
            this.extensionContext.subscriptions
        )

        // Update content every 0.5 seconds
        const interval = setInterval(() => {
            if (this.panel) {
                this.updateContent()
            } else {
                clearInterval(interval)
            }
        }, 500)
        this.extensionContext.subscriptions.push({ dispose: () => clearInterval(interval) })
    }

    /**
     * Updates the content of the webview
     */
    private updateContent(): void {
        if (!this.panel) {
            return
        }

        const trackedFiles = this.predictionTracker.getTrackedFiles()
        const fileData: { [key: string]: FileSnapshot[] } = {}

        for (const filePath of trackedFiles) {
            fileData[filePath] = this.predictionTracker.getFileSnapshots(filePath)
        }

        void this.panel.webview.postMessage({
            command: 'updateFiles',
            files: fileData,
            totalCount: this.predictionTracker.getTotalSnapshotCount(),
        })
    }

    /**
     * Generates diffs between adjacent snapshots of the currently opened file
     * and between the newest snapshot and the current file content
     */
    private async generateDiffs(): Promise<void> {
        if (!this.panel) {
            return
        }

        // Get the currently active text editor
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            void vscode.window.showErrorMessage('No active text editor found')
            return
        }

        const filePath = editor.document.uri.fsPath

        // Generate diffs using the PredictionTracker's method
        try {
            const supplementalContexts = await this.predictionTracker.generatePredictionSupplementalContext()

            if (supplementalContexts.length === 0) {
                void vscode.window.showInformationMessage('No snapshots found for the current file')
                return
            }

            // Send the full supplemental contexts to webview
            void this.panel.webview.postMessage({
                command: 'showDiffs',
                filePath,
                diffs: supplementalContexts,
            })
        } catch (err) {
            getLogger().error(`Failed to generate diffs: ${err}`)
            void vscode.window.showErrorMessage('Failed to generate diffs')
        }
    }

    /**
     * Shows the content of a specific snapshot
     */
    private async showSnapshotContent(filePath: string, timestamp: number): Promise<void> {
        if (!this.panel) {
            return
        }

        const snapshots = this.predictionTracker.getFileSnapshots(filePath)
        const snapshot = snapshots.find((s: FileSnapshot) => s.timestamp === timestamp)

        if (snapshot) {
            try {
                // Load content from storage on demand
                const content = await this.predictionTracker.getSnapshotContent(snapshot)

                void this.panel.webview.postMessage({
                    command: 'showSnapshotContent',
                    filePath: snapshot.filePath,
                    timestamp: snapshot.timestamp,
                    content: content,
                })
            } catch (err) {
                getLogger().error(`Failed to load snapshot content: ${err}`)

                void this.panel.webview.postMessage({
                    command: 'showSnapshotContent',
                    filePath: snapshot.filePath,
                    timestamp: snapshot.timestamp,
                    content: '(Error loading content)',
                })
            }
        }
    }

    /**
     * Gets the HTML content for the webview
     */
    private getWebviewContent(): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>File Snapshot Visualizer</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    padding-bottom: 10px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                .button-group {
                    display: flex;
                    gap: 8px;
                }
                .btn {
                    padding: 8px 12px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    cursor: pointer;
                }
                .file-section {
                    margin-bottom: 30px;
                }
                .file-header {
                    font-weight: bold;
                    margin-bottom: 8px;
                    padding: 6px 10px;
                    background-color: var(--vscode-editor-lineHighlightBackground);
                    cursor: pointer;
                    user-select: none;
                }
                .file-snapshots {
                    margin-left: 20px;
                }
                .snapshot-item {
                    padding: 4px 0;
                    margin: 4px 0;
                    cursor: pointer;
                }
                .snapshot-item:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .snapshot-content {
                    margin-top: 20px;
                    white-space: pre-wrap;
                    border: 1px solid var(--vscode-panel-border);
                    padding: 10px;
                    background-color: var(--vscode-editor-background);
                    max-height: 400px;
                    overflow: auto;
                    font-family: monospace;
                }
                .hidden {
                    display: none;
                }
                .content-header {
                    font-weight: bold;
                    padding: 5px 0;
                }
                .no-files {
                    font-style: italic;
                    padding: 20px;
                    text-align: center;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>File Snapshot Visualizer</h2>
                <div class="button-group">
                    <span id="total-count">0 snapshots</span>
                    <button class="btn" id="refresh-btn">Refresh</button>
                    <button class="btn" id="fire-api-btn">FireAPI</button>
                </div>
            </div>
            
            <div id="files-container">
                <div class="no-files">No files tracked yet. Make some edits to see snapshots appear.</div>
            </div>
            
            <div id="content-viewer" class="hidden">
                <div class="content-header" id="content-header"></div>
                <div class="snapshot-content" id="snapshot-content"></div>
            </div>
            
            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    const filesContainer = document.getElementById('files-container');
                    const contentViewer = document.getElementById('content-viewer');
                    const contentHeader = document.getElementById('content-header');
                    const snapshotContent = document.getElementById('snapshot-content');
                    const totalCount = document.getElementById('total-count');
                    
                    // Handle message from extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        
                        switch (message.command) {
                            case 'updateFiles':
                                updateFilesView(message.files, message.totalCount);
                                break;
                            case 'showSnapshotContent':
                                showContent(message.filePath, message.timestamp, message.content);
                                break;
                            case 'showDiffs':
                                showDiffs(message.filePath, message.diffs);
                                break;
                        }
                    });
                    
                    // Update the files view
                    function updateFilesView(files, count) {
                        filesContainer.innerHTML = '';
                        totalCount.textContent = count + ' snapshots';
                        
                        const fileEntries = Object.entries(files);
                        if (fileEntries.length === 0) {
                            filesContainer.innerHTML = '<div class="no-files">No files tracked yet. Make some edits to see snapshots appear.</div>';
                            return;
                        }
                        
                        for (const [filePath, snapshots] of fileEntries) {
                            const fileSection = document.createElement('div');
                            fileSection.className = 'file-section';
                            
                            const fileName = filePath.split('/').pop();
                            
                            const fileHeader = document.createElement('div');
                            fileHeader.className = 'file-header';
                            fileHeader.textContent = fileName + ' (' + snapshots.length + ' snapshots)';
                            fileHeader.title = filePath;
                            fileHeader.addEventListener('click', () => {
                                const snapshotsContainer = fileHeader.nextElementSibling;
                                if (snapshotsContainer.classList.contains('hidden')) {
                                    snapshotsContainer.classList.remove('hidden');
                                } else {
                                    snapshotsContainer.classList.add('hidden');
                                }
                            });
                            
                            const snapshotsContainer = document.createElement('div');
                            snapshotsContainer.className = 'file-snapshots';
                            
                            snapshots.forEach(snapshot => {
                                const snapshotItem = document.createElement('div');
                                snapshotItem.className = 'snapshot-item';
                                const date = new Date(snapshot.timestamp);
                                snapshotItem.textContent = date.toLocaleTimeString() + ' - ' + 
                                                          (snapshot.size / 1024).toFixed(2) + ' KB';
                                snapshotItem.addEventListener('click', () => {
                                    vscode.postMessage({
                                        command: 'showSnapshot',
                                        filePath: filePath,
                                        timestamp: snapshot.timestamp
                                    });
                                });
                                
                                snapshotsContainer.appendChild(snapshotItem);
                            });
                            
                            fileSection.appendChild(fileHeader);
                            fileSection.appendChild(snapshotsContainer);
                            filesContainer.appendChild(fileSection);
                        }
                    }
                    
                    // Show the content of a snapshot
                    function showContent(filePath, timestamp, content) {
                        contentViewer.classList.remove('hidden');
                        const date = new Date(timestamp);
                        contentHeader.textContent = filePath.split('/').pop() + ' - ' + date.toLocaleString();
                        snapshotContent.textContent = content;
                    }
                    
                    // Show diffs between snapshots
                    function showDiffs(filePath, supplementalContexts) {
                        contentViewer.classList.remove('hidden');
                        const fileName = filePath.split('/').pop();
                        contentHeader.textContent = 'Supplemental Contexts for ' + fileName + ' (' + supplementalContexts.length + ' contexts)';
                        
                        // Format each supplemental context with its metadata
                        let formattedOutput = '';
                        
                        supplementalContexts.forEach((context, index) => {
                            formattedOutput += '=== Supplemental Context #' + (index + 1) + ' ===\\n';
                            formattedOutput += 'File Path: ' + context.filePath + '\\n';
                            formattedOutput += 'Type: ' + context.type + '\\n';
                            
                            if (context.metadata && context.metadata.previousEditorStateMetadata) {
                                const timeOffset = context.metadata.previousEditorStateMetadata.timeOffset;
                                formattedOutput += 'Time Offset: ' + timeOffset + 'ms (' + (timeOffset / 1000).toFixed(2) + ' seconds)\\n';
                            }
                            
                            formattedOutput += '\\nDiff Content:\\n';
                            formattedOutput += context.content;
                            
                            if (index < supplementalContexts.length - 1) {
                                formattedOutput += '\\n\\n' + '='.repeat(80) + '\\n\\n';
                            }
                        });
                        
                        snapshotContent.textContent = formattedOutput;
                    }
                    
                    // Refresh button handler
                    document.getElementById('refresh-btn').addEventListener('click', () => {
                        vscode.postMessage({ command: 'refresh' });
                    });
                    
                    // FireAPI button handler
                    document.getElementById('fire-api-btn').addEventListener('click', () => {
                        vscode.postMessage({ command: 'fireAPI' });
                    });
                    
                    // Request initial data
                    vscode.postMessage({ command: 'refresh' });
                })();
            </script>
        </body>
        </html>`
    }
}
