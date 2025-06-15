/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DiffAnimationController - Progressive Diff Animation with Smart Scanning
 *
 * Key Features:
 * 1. Progressive rendering - lines appear as they are scanned
 * 2. Smart region detection - only scans changed areas + context
 * 3. Yellow scanning line animation like Cline
 * 4. Auto-scroll with user override detection
 * 5. GitHub-style diff decorations
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { getLogger } from 'aws-core-vscode/shared'
import { diffLines } from 'diff'

export interface DiffAnimation {
    uri: vscode.Uri
    originalContent: string
    newContent: string
    isShowingStaticDiff?: boolean
    animationCancelled?: boolean
    isFromChatClick?: boolean
}

export interface PartialUpdateOptions {
    changeLocation?: {
        startLine: number
        endLine: number
        startChar?: number
        endChar?: number
    }
    searchContent?: string
    isPartialUpdate?: boolean
}

interface DiffLine {
    type: 'unchanged' | 'added' | 'removed'
    content: string
    lineNumber: number
    oldLineNumber?: number
    newLineNumber?: number
}

export class DiffAnimationController {
    private activeAnimations = new Map<string, DiffAnimation>()
    private diffWebviews = new Map<string, vscode.WebviewPanel>()
    private fileAnimationHistory = new Map<
        string,
        {
            lastAnimatedContent: string
            animationCount: number
            isCurrentlyAnimating: boolean
        }
    >()
    private animationTimeouts = new Map<string, NodeJS.Timeout[]>()
    private fileSnapshots = new Map<string, string>()

    // Auto-scroll control
    private shouldAutoScroll = new Map<string, boolean>()
    private lastScrollPosition = new Map<string, number>()

    constructor() {
        getLogger().info('[DiffAnimationController] 🚀 Initialized with progressive scanning animation')
    }

    public getAnimationData(filePath: string): DiffAnimation | undefined {
        return this.activeAnimations.get(filePath)
    }

    /**
     * Check if we should show static diff for a file
     */
    public shouldShowStaticDiff(filePath: string, newContent: string): boolean {
        const history = this.fileAnimationHistory.get(filePath)
        if (!history) {
            return false
        }

        if (history.isCurrentlyAnimating) {
            return false
        }

        return true
    }

    /**
     * Update animation history when starting animation
     */
    private updateAnimationStart(filePath: string): void {
        const history = this.fileAnimationHistory.get(filePath) || {
            lastAnimatedContent: '',
            animationCount: 0,
            isCurrentlyAnimating: false,
        }

        history.isCurrentlyAnimating = true
        history.animationCount++
        this.fileAnimationHistory.set(filePath, history)
    }

    /**
     * Update animation history when completing animation
     */
    private updateAnimationComplete(filePath: string, finalContent: string): void {
        const history = this.fileAnimationHistory.get(filePath)
        if (history) {
            history.isCurrentlyAnimating = false
            history.lastAnimatedContent = finalContent
            this.fileAnimationHistory.set(filePath, history)
        }
    }

    /**
     * Calculate the changed region between original and new content
     */
    private calculateChangedRegion(
        originalContent: string,
        newContent: string
    ): { startLine: number; endLine: number; totalLines: number } {
        // For new files, animate all lines
        if (!originalContent || originalContent === '') {
            const lines = newContent.split('\n')
            return {
                startLine: 0,
                endLine: Math.min(lines.length - 1, 99), // Cap at 100 lines
                totalLines: lines.length,
            }
        }

        const changes = diffLines(originalContent, newContent)
        let minChangedLine = Infinity
        let maxChangedLine = -1
        let currentLine = 0
        const newLines = newContent.split('\n')

        for (const change of changes) {
            const changeLines = change.value.split('\n')
            // Remove empty last element from split
            if (changeLines[changeLines.length - 1] === '') {
                changeLines.pop()
            }

            if (change.added || change.removed) {
                minChangedLine = Math.min(minChangedLine, currentLine)
                maxChangedLine = Math.max(maxChangedLine, currentLine + changeLines.length - 1)
            }

            if (!change.removed) {
                currentLine += changeLines.length
            }
        }

        // If no changes found, animate the whole file
        if (minChangedLine === Infinity) {
            return {
                startLine: 0,
                endLine: Math.min(newLines.length - 1, 99),
                totalLines: newLines.length,
            }
        }

        // Add context lines (3 before and after)
        const contextLines = 3
        const startLine = Math.max(0, minChangedLine - contextLines)
        const endLine = Math.min(newLines.length - 1, maxChangedLine + contextLines)

        // Cap at 100 lines for performance
        const animationLines = endLine - startLine + 1
        if (animationLines > 100) {
            getLogger().info(`[DiffAnimationController] Capping animation from ${animationLines} to 100 lines`)
            return {
                startLine,
                endLine: startLine + 99,
                totalLines: newLines.length,
            }
        }

        return {
            startLine,
            endLine,
            totalLines: newLines.length,
        }
    }

    /**
     * Start a diff animation for a file
     */
    public async startDiffAnimation(
        filePath: string,
        originalContent: string,
        newContent: string,
        isFromChatClick: boolean = false
    ): Promise<void> {
        const isNewFile = originalContent === ''
        getLogger().info(
            `[DiffAnimationController] 🎬 Starting animation for: ${filePath} (new file: ${isNewFile}, from chat: ${isFromChatClick})`
        )

        if (isFromChatClick) {
            getLogger().info(`[DiffAnimationController] File clicked from chat, showing VS Code diff`)
            await this.showVSCodeDiff(filePath, originalContent, newContent)
            return
        }

        try {
            // Cancel any existing animation for this file
            this.cancelAnimation(filePath)

            // Mark animation as started
            this.updateAnimationStart(filePath)

            const uri = vscode.Uri.file(filePath)

            // Store animation state
            const animation: DiffAnimation = {
                uri,
                originalContent,
                newContent,
                isShowingStaticDiff: false,
                animationCancelled: false,
                isFromChatClick,
            }
            this.activeAnimations.set(filePath, animation)

            // Ensure the file exists and has the new content
            let doc: vscode.TextDocument
            try {
                doc = await vscode.workspace.openTextDocument(uri)
                this.fileSnapshots.set(filePath, doc.getText())
            } catch {
                // Create new file
                await vscode.workspace.fs.writeFile(uri, Buffer.from(''))
                doc = await vscode.workspace.openTextDocument(uri)
                this.fileSnapshots.set(filePath, '')
            }

            // Apply the new content
            const edit = new vscode.WorkspaceEdit()
            const fullRange = new vscode.Range(
                0,
                0,
                doc.lineCount > 0 ? doc.lineCount - 1 : 0,
                doc.lineCount > 0 ? doc.lineAt(Math.max(0, doc.lineCount - 1)).text.length : 0
            )
            edit.replace(uri, fullRange, newContent)
            await vscode.workspace.applyEdit(edit)
            await doc.save()

            // Calculate changed region for optimization
            const changedRegion = this.calculateChangedRegion(originalContent, newContent)
            getLogger().info(
                `[DiffAnimationController] Changed region: lines ${changedRegion.startLine}-${changedRegion.endLine}`
            )

            // Initialize scroll control
            this.shouldAutoScroll.set(filePath, true)
            this.lastScrollPosition.set(filePath, 0)

            // Create or reuse webview for this file
            const webview = await this.getOrCreateDiffWebview(filePath)

            // Start the progressive animation
            await this.animateDiffInWebview(filePath, webview, originalContent, newContent, animation, changedRegion)
        } catch (error) {
            getLogger().error(`[DiffAnimationController] ❌ Failed to start animation: ${error}`)
            this.stopDiffAnimation(filePath)
            throw error
        }
    }

    /**
     * Get or create a webview panel for diff display
     */
    private async getOrCreateDiffWebview(filePath: string): Promise<vscode.WebviewPanel> {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors')
        // Check if we already have a webview for this file
        let webview = this.diffWebviews.get(filePath)
        if (webview) {
            // Reveal existing webview
            webview.reveal(vscode.ViewColumn.One)
            return webview
        }

        // Create new webview
        const fileName = path.basename(filePath)
        webview = vscode.window.createWebviewPanel('amazonQDiff', `Diff: ${fileName}`, vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [],
        })

        // Store webview
        this.diffWebviews.set(filePath, webview)
        // Handle webview disposal
        webview.onDidDispose(() => {
            this.diffWebviews.delete(filePath)
            this.stopDiffAnimation(filePath)
            // Reopen the original file editor after webview is disposed
            Promise.resolve(
                vscode.workspace.openTextDocument(vscode.Uri.file(filePath)).then((doc) => {
                    void vscode.window.showTextDocument(doc, {
                        preview: false,
                        viewColumn: vscode.ViewColumn.One,
                    })
                })
            ).catch((error) => {
                getLogger().error(`[DiffAnimationController] Failed to reopen file after webview disposal: ${error}`)
            })
        })
        // Handle messages from webview (including scroll events)
        webview.webview.onDidReceiveMessage((message) => {
            if (message.command === 'userScrolled') {
                const currentPosition = message.scrollTop
                const lastPosition = this.lastScrollPosition.get(filePath) || 0

                // If user scrolled up, disable auto-scroll
                if (currentPosition < lastPosition - 50) {
                    // 50px threshold
                    this.shouldAutoScroll.set(filePath, false)
                    getLogger().info(`[DiffAnimationController] Auto-scroll disabled for: ${filePath}`)
                }

                this.lastScrollPosition.set(filePath, currentPosition)
            }
        })

        // Set initial HTML
        webview.webview.html = this.getDiffWebviewContent()

        return webview
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
     * Animate diff in webview progressively with smart scanning
     */
    private async animateDiffInWebview(
        filePath: string,
        webview: vscode.WebviewPanel,
        originalContent: string,
        newContent: string,
        animation: DiffAnimation,
        changedRegion: { startLine: number; endLine: number; totalLines: number }
    ): Promise<void> {
        try {
            // Parse diff and create scan plan
            const { leftLines, rightLines, scanPlan } = this.createScanPlan(originalContent, newContent, changedRegion)

            // Clear and start scan
            await webview.webview.postMessage({ command: 'clear' })
            await new Promise((resolve) => setTimeout(resolve, 50))

            await webview.webview.postMessage({
                command: 'startScan',
                totalLines: scanPlan.length,
            })

            // Pre-add lines that are before the scan region (context)
            for (let i = 0; i < Math.min(changedRegion.startLine, 3); i++) {
                if (leftLines[i]) {
                    await webview.webview.postMessage({
                        command: 'addLine',
                        side: 'left',
                        line: leftLines[i],
                        immediately: true,
                    })
                }
                if (rightLines[i]) {
                    await webview.webview.postMessage({
                        command: 'addLine',
                        side: 'right',
                        line: rightLines[i],
                        immediately: true,
                    })
                }
            }

            // Calculate animation speed
            const scanDelay = scanPlan.length > 50 ? 40 : 70

            // Execute scan plan
            for (const scanItem of scanPlan) {
                if (animation.animationCancelled) {
                    break
                }

                // Add lines if not already added
                if (scanItem.leftLine && !scanItem.preAdded) {
                    await webview.webview.postMessage({
                        command: 'addLine',
                        side: 'left',
                        line: scanItem.leftLine,
                        immediately: false,
                    })
                }

                if (scanItem.rightLine && !scanItem.preAdded) {
                    await webview.webview.postMessage({
                        command: 'addLine',
                        side: 'right',
                        line: scanItem.rightLine,
                        immediately: false,
                    })
                }

                // Small delay to ensure lines are added
                await new Promise((resolve) => setTimeout(resolve, 10))

                // Scan the line
                await webview.webview.postMessage({
                    command: 'scanLine',
                    leftIndex: scanItem.leftIndex,
                    rightIndex: scanItem.rightIndex,
                    autoScroll: this.shouldAutoScroll.get(filePath) !== false,
                })

                // Wait before next line
                await new Promise((resolve) => setTimeout(resolve, scanDelay))
            }

            // Add any remaining lines after scan region
            for (let i = changedRegion.endLine + 1; i < leftLines.length || i < rightLines.length; i++) {
                if (i < leftLines.length) {
                    await webview.webview.postMessage({
                        command: 'addLine',
                        side: 'left',
                        line: leftLines[i],
                        immediately: true,
                    })
                }
                if (i < rightLines.length) {
                    await webview.webview.postMessage({
                        command: 'addLine',
                        side: 'right',
                        line: rightLines[i],
                        immediately: true,
                    })
                }
            }

            // Complete animation
            await webview.webview.postMessage({ command: 'completeScan' })

            // Update animation history
            this.updateAnimationComplete(filePath, newContent)

            getLogger().info(`[DiffAnimationController] ✅ Smart scanning completed for: ${filePath}`)

            // Auto-close after a delay if not from chat click
            // Auto-close after a delay if not from chat click
            if (!animation.isFromChatClick) {
                setTimeout(async () => {
                    this.closeDiffWebview(filePath)

                    // ADD THIS: Optionally reopen the file in normal editor
                    try {
                        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath))
                        await vscode.window.showTextDocument(doc, {
                            preview: false,
                            viewColumn: vscode.ViewColumn.One,
                        })
                        getLogger().info(`[DiffAnimationController] Reopened file after animation: ${filePath}`)
                    } catch (error) {
                        getLogger().error(`[DiffAnimationController] Failed to reopen file: ${error}`)
                    }
                }, 3000)
            }
        } catch (error) {
            getLogger().error(`[DiffAnimationController] ❌ Animation failed: ${error}`)
            throw error
        }
    }

    /**
     * Create a smart scan plan based on changed regions
     */
    private createScanPlan(
        originalContent: string,
        newContent: string,
        changedRegion: { startLine: number; endLine: number; totalLines: number }
    ): {
        leftLines: Array<DiffLine & { index: number }>
        rightLines: Array<DiffLine & { index: number }>
        scanPlan: Array<{
            leftIndex: number | undefined
            rightIndex: number | undefined
            leftLine?: DiffLine & { index: number }
            rightLine?: DiffLine & { index: number }
            preAdded?: boolean
        }>
    } {
        const changes = diffLines(originalContent, newContent)
        const leftLines: Array<DiffLine & { index: number }> = []
        const rightLines: Array<DiffLine & { index: number }> = []
        const scanPlan: Array<{
            leftIndex: number | undefined
            rightIndex: number | undefined
            leftLine?: DiffLine & { index: number }
            rightLine?: DiffLine & { index: number }
            preAdded?: boolean
        }> = []

        let leftLineNum = 1
        let rightLineNum = 1
        let leftIndex = 0
        let rightIndex = 0

        for (const change of changes) {
            const lines = change.value.split('\n').filter((l) => l !== undefined)
            if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
                continue
            }

            if (change.removed) {
                // Removed lines only on left
                for (const line of lines) {
                    const diffLine = {
                        type: 'removed' as const,
                        content: line,
                        lineNumber: leftLineNum,
                        oldLineNumber: leftLineNum++,
                        index: leftIndex,
                        leftLineNumber: leftLineNum - 1,
                    }
                    leftLines.push(diffLine)

                    // Add to scan plan if in changed region
                    if (leftIndex >= changedRegion.startLine && leftIndex <= changedRegion.endLine) {
                        scanPlan.push({
                            leftIndex: leftIndex,
                            rightIndex: undefined,
                            leftLine: diffLine,
                        })
                    }
                    leftIndex++
                }
            } else if (change.added) {
                // Added lines only on right
                for (const line of lines) {
                    const diffLine = {
                        type: 'added' as const,
                        content: line,
                        lineNumber: rightLineNum,
                        newLineNumber: rightLineNum++,
                        index: rightIndex,
                        rightLineNumber: rightLineNum - 1,
                    }
                    rightLines.push(diffLine)

                    // Add to scan plan if in changed region
                    if (rightIndex >= changedRegion.startLine && rightIndex <= changedRegion.endLine) {
                        scanPlan.push({
                            leftIndex: undefined,
                            rightIndex: rightIndex,
                            rightLine: diffLine,
                        })
                    }
                    rightIndex++
                }
            } else {
                // Unchanged lines on both sides
                for (const line of lines) {
                    const leftDiffLine = {
                        type: 'unchanged' as const,
                        content: line,
                        lineNumber: leftLineNum,
                        oldLineNumber: leftLineNum++,
                        index: leftIndex,
                        leftLineNumber: leftLineNum - 1,
                    }

                    const rightDiffLine = {
                        type: 'unchanged' as const,
                        content: line,
                        lineNumber: rightLineNum,
                        newLineNumber: rightLineNum++,
                        index: rightIndex,
                        rightLineNumber: rightLineNum - 1,
                    }

                    leftLines.push(leftDiffLine)
                    rightLines.push(rightDiffLine)

                    // Add to scan plan if in changed region
                    if (leftIndex >= changedRegion.startLine && leftIndex <= changedRegion.endLine) {
                        scanPlan.push({
                            leftIndex: leftIndex,
                            rightIndex: rightIndex,
                            leftLine: leftDiffLine,
                            rightLine: rightDiffLine,
                        })
                    }

                    leftIndex++
                    rightIndex++
                }
            }
        }

        return { leftLines, rightLines, scanPlan }
    }

    /**
     * Show VS Code's built-in diff view (for file tab clicks)
     */
    public async showVSCodeDiff(filePath: string, originalContent: string, newContent: string): Promise<void> {
        const fileName = path.basename(filePath)

        // Close all editors first (Issue #3)
        await vscode.commands.executeCommand('workbench.action.closeAllEditors')

        // For new files, use empty content if original is empty
        const leftContent = originalContent || ''

        // Create temporary file for original content with a unique scheme
        const leftUri = vscode.Uri.from({
            scheme: 'amazon-q-diff-temp',
            path: `${fileName}`,
            query: `original=${Date.now()}`, // Add timestamp to make it unique
        })

        // Register a one-time content provider for this URI
        const disposable = vscode.workspace.registerTextDocumentContentProvider('amazon-q-diff-temp', {
            provideTextDocumentContent: (uri) => {
                if (uri.toString() === leftUri.toString()) {
                    return leftContent
                }
                return ''
            },
        })

        try {
            // Open diff view
            const fileUri = vscode.Uri.file(filePath)
            await vscode.commands.executeCommand(
                'vscode.diff',
                leftUri,
                fileUri,
                `${fileName}: ${leftContent ? 'Original' : 'New File'} ↔ Current`
            )
        } finally {
            // Clean up the content provider after a delay
            setTimeout(() => disposable.dispose(), 1000)
        }
    }
    /**
     * Show static diff view (reuse existing webview)
     */
    public async showStaticDiffView(filePath: string): Promise<void> {
        const animation = this.activeAnimations.get(filePath)
        if (!animation) {
            getLogger().warn(`[DiffAnimationController] No animation data found for: ${filePath}`)
            return
        }

        // Show VS Code diff for static view
        await this.showVSCodeDiff(filePath, animation.originalContent, animation.newContent)
    }

    /**
     * Start partial diff animation
     */
    public async startPartialDiffAnimation(
        filePath: string,
        originalContent: string,
        newContent: string,
        options: PartialUpdateOptions = {}
    ): Promise<void> {
        // For now, fall back to full animation
        // TODO: Implement partial updates in webview
        return this.startDiffAnimation(filePath, originalContent, newContent)
    }

    /**
     * Close diff webview for a file
     */
    private closeDiffWebview(filePath: string): void {
        const webview = this.diffWebviews.get(filePath)
        if (webview) {
            webview.dispose()
            this.diffWebviews.delete(filePath)
        }
    }

    /**
     * Cancel ongoing animation
     */
    private cancelAnimation(filePath: string): void {
        const animation = this.activeAnimations.get(filePath)
        if (animation && !animation.isShowingStaticDiff) {
            animation.animationCancelled = true

            // Clear timeouts
            const timeouts = this.animationTimeouts.get(filePath)
            if (timeouts) {
                for (const timeout of timeouts) {
                    clearTimeout(timeout)
                }
                this.animationTimeouts.delete(filePath)
            }
        }
    }

    /**
     * Stop diff animation for a file
     */
    public stopDiffAnimation(filePath: string): void {
        getLogger().info(`[DiffAnimationController] 🛑 Stopping animation for: ${filePath}`)

        this.cancelAnimation(filePath)
        this.closeDiffWebview(filePath)

        this.activeAnimations.delete(filePath)
        this.fileSnapshots.delete(filePath)
        this.animationTimeouts.delete(filePath)
        this.shouldAutoScroll.delete(filePath)
        this.lastScrollPosition.delete(filePath)
    }

    /**
     * Stop all animations
     */
    public stopAllAnimations(): void {
        getLogger().info('[DiffAnimationController] 🛑 Stopping all animations')
        for (const [filePath] of this.activeAnimations) {
            this.stopDiffAnimation(filePath)
        }
    }

    /**
     * Check if animating
     */
    public isAnimating(filePath: string): boolean {
        const animation = this.activeAnimations.get(filePath)
        const history = this.fileAnimationHistory.get(filePath)
        return (
            (animation ? !animation.isShowingStaticDiff && !animation.animationCancelled : false) ||
            (history ? history.isCurrentlyAnimating : false)
        )
    }

    /**
     * Check if showing static diff
     */
    public isShowingStaticDiff(filePath: string): boolean {
        const animation = this.activeAnimations.get(filePath)
        return animation?.isShowingStaticDiff ?? false
    }

    /**
     * Get animation stats
     */
    public getAnimationStats(): { activeCount: number; filePaths: string[] } {
        return {
            activeCount: this.activeAnimations.size,
            filePaths: Array.from(this.activeAnimations.keys()),
        }
    }

    /**
     * Dispose
     */
    public dispose(): void {
        getLogger().info('[DiffAnimationController] 💥 Disposing controller')
        this.stopAllAnimations()

        // Close all webviews
        for (const [_, webview] of this.diffWebviews) {
            webview.dispose()
        }
        this.diffWebviews.clear()
    }
}
