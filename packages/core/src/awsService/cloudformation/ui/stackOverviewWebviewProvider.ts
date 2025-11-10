/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebviewPanel, window, ViewColumn } from 'vscode'
import { StackInfo } from '../stacks/actions/stackActionRequestType'

export class StackOverviewWebviewProvider {
    private panels = new Map<string, WebviewPanel>()

    async showStackOverview(stack: StackInfo): Promise<void> {
        const stackName = stack.StackName ?? 'Unknown Stack'

        // Reuse existing panel if available
        let panel = this.panels.get(stackName)

        if (panel) {
            panel.reveal(ViewColumn.One)
            return
        }

        // Create new panel
        panel = window.createWebviewPanel('stackOverview', `Stack Overview: ${stackName}`, ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
        })

        this.panels.set(stackName, panel)

        // Clean up when panel is disposed
        panel.onDidDispose(() => {
            this.panels.delete(stackName)
        })

        // Render content
        panel.webview.html = this.getWebviewContent(stack)
    }

    private getWebviewContent(stack: StackInfo): string {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stack Overview</title>
    <style>
        body { 
            font-family: var(--vscode-font-family); 
            padding: 20px; 
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .header { 
            margin-bottom: 40px; 
        }
        .status-line {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-top: 10px;
            font-size: 16px;
        }
        .status-icon {
            width: 18px;
            height: 18px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: bold;
        }
        .status-icon.complete { color: #28a745; }
        .status-icon.complete::before { content: "✓"; }
        .status-icon.failed { color: #dc3545; }
        .status-icon.failed::before { content: "✗"; }
        .status-icon.progress { color: #ffc107; }
        .status-icon.progress::before { content: "⟳"; }
        .section-title {
            font-size: 20px;
            font-weight: bold;
            margin: 25px 0 20px 0;
            color: var(--vscode-foreground);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 8px;
        }
        .field-row {
            display: grid;
            grid-template-columns: 200px 1fr;
            gap: 15px;
            margin-bottom: 8px;
            align-items: start;
            padding: 8px 12px;
            border-radius: 3px;
        }
        .field-row:nth-child(even) {
            background-color: var(--vscode-list-hoverBackground);
        }
        .field-label {
            font-weight: bold;
            color: var(--vscode-foreground);
        }
        .field-value {
            color: var(--vscode-descriptionForeground);
            word-break: break-word;
        }
        .section {
            margin-bottom: 25px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${stack.StackName}</h1>
        <div class="status-line">
            <div class="status-icon ${this.getStatusClass(stack.StackStatus)}"></div>
            <span>${this.getStatusText(stack.StackStatus)}</span>
        </div>
    </div>
    
    <div class="section-title">Overview</div>
    
    <div class="section">
        <div class="field-row">
            <div class="field-label">Stack ID</div>
            <div class="field-value">${stack.StackId || '-'}</div>
        </div>
        <div class="field-row">
            <div class="field-label">Description</div>
            <div class="field-value">${stack.TemplateDescription || '-'}</div>
        </div>
        <div class="field-row">
            <div class="field-label">Created time</div>
            <div class="field-value">${stack.CreationTime || '-'}</div>
        </div>
        <div class="field-row">
            <div class="field-label">Updated time</div>
            <div class="field-value">${stack.LastUpdatedTime || '-'}</div>
        </div>
    </div>

    <div class="section-title">Status</div>
    <div class="section">
        <div class="field-row">
            <div class="field-label">Status</div>
            <div class="field-value">${stack.StackStatus || '-'}</div>
        </div>
        <div class="field-row">
            <div class="field-label">Detailed status</div>
            <div class="field-value">-</div>
        </div>
        <div class="field-row">
            <div class="field-label">Status reason</div>
            <div class="field-value">${stack.StackStatusReason || '-'}</div>
        </div>
    </div>

    <div class="section-title">Configuration</div>
    <div class="section">
        <div class="field-row">
            <div class="field-label">Rollback disabled</div>
            <div class="field-value">${stack.DisableRollback ? 'Yes' : 'No'}</div>
        </div>
        <div class="field-row">
            <div class="field-label">Termination protection</div>
            <div class="field-value">${stack.EnableTerminationProtection ? 'Enabled' : 'Disabled'}</div>
        </div>
        <div class="field-row">
            <div class="field-label">Timeout (minutes)</div>
            <div class="field-value">${stack.TimeoutInMinutes || '-'}</div>
        </div>
    </div>

    ${
        stack.RootId || stack.ParentId
            ? `
    <div class="section-title">Nested Stack</div>
    <div class="section">
        ${
            stack.RootId
                ? `
        <div class="field-row">
            <div class="field-label">Root stack</div>
            <div class="field-value">${stack.RootId}</div>
        </div>
        `
                : ''
        }
        ${
            stack.ParentId
                ? `
        <div class="field-row">
            <div class="field-label">Parent stack</div>
            <div class="field-value">${stack.ParentId}</div>
        </div>
        `
                : ''
        }
    </div>
    `
            : ''
    }
</body>
</html>`
    }

    private getStatusClass(status?: string): string {
        if (!status) {
            return ''
        }
        if (status.includes('COMPLETE') && !status.includes('ROLLBACK')) {
            return 'complete'
        }
        if (status.includes('FAILED') || status.includes('ROLLBACK')) {
            return 'failed'
        }
        if (status.includes('PROGRESS')) {
            return 'progress'
        }
        return ''
    }

    private getStatusText(status?: string): string {
        if (!status) {
            return 'Unknown'
        }

        // Handle specific cases with proper capitalization
        const statusMap: { [key: string]: string } = {
            CREATE_COMPLETE: 'Create complete',
            UPDATE_COMPLETE: 'Update complete',
            DELETE_COMPLETE: 'Delete complete',
            CREATE_FAILED: 'Create failed',
            UPDATE_FAILED: 'Update failed',
            DELETE_FAILED: 'Delete failed',
            CREATE_IN_PROGRESS: 'Create in progress',
            UPDATE_IN_PROGRESS: 'Update in progress',
            DELETE_IN_PROGRESS: 'Delete in progress',
            ROLLBACK_COMPLETE: 'Rollback complete',
            ROLLBACK_FAILED: 'Rollback failed',
            ROLLBACK_IN_PROGRESS: 'Rollback in progress',
            UPDATE_ROLLBACK_COMPLETE: 'Update rollback complete',
            UPDATE_ROLLBACK_FAILED: 'Update rollback failed',
            UPDATE_ROLLBACK_IN_PROGRESS: 'Update rollback in progress',
        }

        return statusMap[status] || status.toLowerCase().replace(/_/g, ' ')
    }
}
