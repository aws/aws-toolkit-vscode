/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebviewView, WebviewViewProvider, commands } from 'vscode'
import { StackChange } from '../stacks/actions/stackActionRequestType'
import { DiffViewHelper } from './diffViewHelper'
import { commandKey } from '../utils'

const webviewCommandOpenDiff = 'openDiff'

export class DiffWebviewProvider implements WebviewViewProvider {
    private _view?: WebviewView
    private stackName = ''
    private changes: StackChange[] = []
    private changeSetName?: string
    private enableDeployments: boolean = false
    private currentPage: number = 0
    private pageSize: number = 50
    private totalPages: number = 0

    updateData(stackName: string, changes: StackChange[] = [], changeSetName?: string, enableDeployments = false) {
        this.stackName = stackName
        this.changes = changes
        this.changeSetName = changeSetName
        this.enableDeployments = enableDeployments
        this.currentPage = 0
        this.totalPages = Math.ceil(changes.length / this.pageSize)
        if (this._view) {
            this._view.webview.html = this.getHtmlContent()
        }
    }

    resolveWebviewView(webviewView: WebviewView) {
        this._view = webviewView
        webviewView.webview.options = { enableScripts: true }
        webviewView.webview.html = this.getHtmlContent()

        webviewView.webview.onDidReceiveMessage((message: { command: string; resourceId?: string }) => {
            if (message.command === webviewCommandOpenDiff) {
                void DiffViewHelper.openDiff(this.stackName, this.changes, message.resourceId)
            } else if (message.command === 'confirmDeploy') {
                if (this.changeSetName) {
                    void commands.executeCommand(commandKey('api.executeChangeSet'), this.stackName, this.changeSetName)
                    this.changeSetName = undefined
                    this.enableDeployments = false
                    this._view!.webview.html = this.getHtmlContent()
                }
            } else if (message.command === 'deleteChangeSet') {
                void commands.executeCommand(commandKey('stacks.deleteChangeSet'), {
                    stackName: this.stackName,
                    changeSetName: this.changeSetName,
                })
                this.changeSetName = undefined
                this.enableDeployments = false
                this._view!.webview.html = this.getHtmlContent()
            } else if (message.command === 'nextPage') {
                if (this.currentPage < this.totalPages - 1) {
                    this.currentPage++
                    this._view!.webview.html = this.getHtmlContent()
                }
            } else if (message.command === 'prevPage') {
                if (this.currentPage > 0) {
                    this.currentPage--
                    this._view!.webview.html = this.getHtmlContent()
                }
            }
        })
    }

    private getHtmlContent(): string {
        const changes = this.changes

        const startIndex = this.currentPage * this.pageSize
        const endIndex = startIndex + this.pageSize
        const displayedChanges = changes.slice(startIndex, endIndex)
        const hasNext = this.currentPage < this.totalPages - 1
        const hasPrev = this.currentPage > 0

        if (!changes || changes.length === 0) {
            return `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            font-family: var(--vscode-font-family);
                            margin: 8px;
                            background-color: var(--vscode-editor-background);
                            color: var(--vscode-foreground);
                        }
                    </style>
                </head>
                <body>
                    <p>No changes detected for stack: ${this.stackName}</p>
                </body>
                </html>
            `
        }

        // Check if any resource has drift
        // TODO: adapt if we do real backend pagination
        const hasDrift = changes.some(
            (change) =>
                change.resourceChange?.resourceDriftStatus ||
                change.resourceChange?.details?.some(
                    (detail) => detail.Target?.Drift || detail.Target?.LiveResourceDrift
                )
        )

        let tableHtml = `
            <table style="width: 100%; border-collapse: collapse; border: 1px solid var(--vscode-panel-border);">
                <tr>
                    <th style="width: 5%; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);"></th>
                    <th style="width: ${hasDrift ? '8' : '10'}%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);" title="The action that CloudFormation takes on the resource (Add, Modify, Remove, Import, or Dynamic)">Action</th>
                    <th style="width: ${hasDrift ? '18' : '20'}%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);" title="The logical name of the resource as defined in the template">LogicalResourceId</th>
                    <th style="width: ${hasDrift ? '25' : '30'}%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);" title="The physical name or unique identifier of the resource">PhysicalResourceId</th>
                    <th style="width: ${hasDrift ? '18' : '20'}%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);" title="The type of CloudFormation resource (e.g., AWS::S3::Bucket)">ResourceType</th>
                    <th style="width: ${hasDrift ? '10' : '15'}%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);" title="Indicates whether CloudFormation will replace the resource (True, False, Conditional, or N/A)">Replacement</th>${
                        hasDrift
                            ? `
                    <th style="width: 16%; word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);" title="Indicates if the live resource has drifted from the template">Drift Status</th>`
                            : ''
                    }
                </tr>`

        for (const [changeIndex, change] of displayedChanges.entries()) {
            const rc = change.resourceChange
            if (!rc) {
                continue
            }

            const borderColor =
                rc.action === 'Add'
                    ? 'var(--vscode-gitDecoration-addedResourceForeground)'
                    : rc.action === 'Remove'
                      ? 'var(--vscode-gitDecoration-deletedResourceForeground)'
                      : rc.action === 'Modify'
                        ? 'var(--vscode-gitDecoration-modifiedResourceForeground)'
                        : 'transparent'

            const hasDetails = rc.details && rc.details.length > 0
            const expandIcon = hasDetails ? '▶' : ''

            const driftStatus = rc.resourceDriftStatus
            const hasDriftDetails = rc.details?.some(
                (detail) => detail.Target?.Drift || detail.Target?.LiveResourceDrift
            )
            let driftDisplay = ''
            if (driftStatus === 'DELETED') {
                driftDisplay = '⚠️ Deleted'
            } else if (hasDriftDetails) {
                driftDisplay = '⚠️ Modified'
            } else if (driftStatus && driftStatus !== 'IN_SYNC') {
                driftDisplay = `⚠️ ${driftStatus}`
            }

            tableHtml += `<tr style="border-left: 4px solid ${borderColor}; color: var(--vscode-foreground);">
                <td style="border: 1px solid var(--vscode-panel-border); padding: 4px; text-align: center; cursor: ${hasDetails ? 'pointer' : 'default'};" ${hasDetails ? `onclick="toggleDetails(${changeIndex})"` : ''}>
                    <span id="expand-icon-${changeIndex}">${expandIcon}</span>
                </td>
                <td style="word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; text-align: center; font-weight: bold;">${rc.action ?? 'Unknown'}</td>
                <td style="word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; text-align: center;"><a href="#" onclick="openDiffToResource('${rc.logicalResourceId}'); return false;" style="color: var(--vscode-textLink-foreground); cursor: pointer; font-weight: bold; text-decoration: underline;">${rc.logicalResourceId ?? 'Unknown'}</a></td>
                <td style="word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; text-align: center;">${rc.physicalResourceId ?? ' '}</td>
                <td style="word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; text-align: center;">${rc.resourceType ?? 'Unknown'}</td>
                <td style="word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; text-align: center;">${rc.replacement ?? 'N/A'}</td>${
                    hasDrift
                        ? `
                <td style="word-wrap: break-word; border: 1px solid var(--vscode-panel-border); padding: 4px; text-align: center; color: ${driftDisplay ? 'var(--vscode-editorWarning-foreground)' : 'var(--vscode-foreground)'}; font-weight: ${driftDisplay ? 'bold' : 'normal'};">${driftDisplay || '-'}</td>`
                        : ''
                }
            </tr>`

            if (hasDetails) {
                tableHtml += `<tr id="details-${changeIndex}" style="display: none;">
                    <td colspan="${hasDrift ? '7' : '6'}" style="border: 1px solid var(--vscode-panel-border); padding: 8px; background-color: var(--vscode-sideBar-background);">
                        <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
                            <tr style="background-color: var(--vscode-sideBarSectionHeader-background);">
                                <th style="width: ${hasDriftDetails ? '10' : '12'}%; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground);" title="The type of change to the attribute (Add, Remove, or Modify)">Attribute Change Type</th>
                                <th style="width: ${hasDriftDetails ? '12' : '15'}%; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground);" title="The name of the resource property that is changing">Name</th>
                                <th style="width: ${hasDriftDetails ? '10' : '12'}%; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground);" title="Indicates whether changing this property requires resource recreation (Never, Conditionally, or Always)">Requires Recreation</th>
                                <th style="width: ${hasDriftDetails ? '15' : '18'}%; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground);" title="The value of the property before the change">Before Value</th>
                                <th style="width: ${hasDriftDetails ? '15' : '18'}%; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground);" title="The value of the property after the change">After Value</th>
                                <th style="width: ${hasDriftDetails ? '10' : '12'}%; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground);" title="The source of the change (ResourceReference, ParameterReference, ResourceAttribute, DirectModification, or Automatic)">Change Source</th>
                                <th style="width: ${hasDriftDetails ? '11' : '13'}%; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground);" title="The identity of the entity that triggered this change (parameter name, resource logical ID, etc.)">Causing Entity</th>${
                                    hasDriftDetails
                                        ? `
                                <th style="width: 9%; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground);" title="The previous value from the last deployment">Drift: Previous</th>
                                <th style="width: 8%; border: 1px solid var(--vscode-panel-border); padding: 4px; color: var(--vscode-foreground);" title="The actual value in the live AWS resource">Drift: Actual</th>`
                                        : ''
                                }
                            </tr>`

                for (const detail of rc.details || []) {
                    const target = detail.Target
                    const attrChangeType = target?.AttributeChangeType ?? ' '
                    const attrBorderColor =
                        attrChangeType === 'Add'
                            ? 'var(--vscode-gitDecoration-addedResourceForeground)'
                            : attrChangeType === 'Remove'
                              ? 'var(--vscode-gitDecoration-deletedResourceForeground)'
                              : attrChangeType === 'Modify'
                                ? 'var(--vscode-gitDecoration-modifiedResourceForeground)'
                                : borderColor
                    const drift = target?.Drift || target?.LiveResourceDrift
                    tableHtml += `<tr style="border-left: 4px solid ${attrBorderColor}; color: var(--vscode-foreground);">
                        <td style="border: 1px solid var(--vscode-panel-border); padding: 4px; text-align: center; font-weight: bold; color: var(--vscode-foreground);">${attrChangeType}</td>
                        <td style="border: 1px solid var(--vscode-panel-border); padding: 4px; text-align: center; word-wrap: break-word; color: var(--vscode-foreground);">${target?.Name ?? ' '}</td>
                        <td style="border: 1px solid var(--vscode-panel-border); padding: 4px; text-align: center; color: var(--vscode-foreground);">${target?.RequiresRecreation ?? 'Unknown'}</td>
                        <td style="border: 1px solid var(--vscode-panel-border); padding: 4px; text-align: center; word-wrap: break-word; color: var(--vscode-foreground);">${target?.BeforeValue ?? ' '}</td>
                        <td style="border: 1px solid var(--vscode-panel-border); padding: 4px; text-align: center; word-wrap: break-word; color: var(--vscode-foreground);">${target?.AfterValue ?? ' '}</td>
                        <td style="border: 1px solid var(--vscode-panel-border); padding: 4px; text-align: center; color: var(--vscode-foreground);">${detail?.ChangeSource ?? ' '}</td>
                        <td style="border: 1px solid var(--vscode-panel-border); padding: 4px; text-align: center; word-wrap: break-word; color: var(--vscode-foreground);">${detail?.CausingEntity ?? ' '}</td>${
                            hasDriftDetails
                                ? `
                        <td style="border: 1px solid var(--vscode-panel-border); padding: 4px; text-align: center; word-wrap: break-word; color: ${drift ? 'var(--vscode-editorWarning-foreground)' : 'var(--vscode-foreground)'};">${drift?.PreviousValue ?? '-'}</td>
                        <td style="border: 1px solid var(--vscode-panel-border); padding: 4px; text-align: center; word-wrap: break-word; color: ${drift ? 'var(--vscode-editorWarning-foreground)' : 'var(--vscode-foreground)'}; font-weight: ${drift ? 'bold' : 'normal'};">${drift?.ActualValue ?? '-'}</td>`
                                : ''
                        }
                    </tr>`
                }

                tableHtml += `</table></td></tr>`
            }
        }

        tableHtml += `</table>`

        const paginationControls =
            this.totalPages > 1
                ? `
            <div class="pagination-controls" style="
                position: fixed;
                top: 0;
                right: 0;
                z-index: 10;
                background: var(--vscode-editor-background);
                padding: 8px;
                border-bottom: 1px solid var(--vscode-panel-border);
                border-left: 1px solid var(--vscode-panel-border);
                display: flex;
                justify-content: flex-end;
                align-items: center;
                gap: 8px;
            ">
                <span style="color: var(--vscode-foreground);">Page ${this.currentPage + 1} of ${this.totalPages}</span>
                <button onclick="prevPage()" ${!hasPrev ? 'disabled' : ''} style="
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 4px 12px;
                    cursor: ${hasPrev ? 'pointer' : 'not-allowed'};
                    border-radius: 2px;
                    opacity: ${hasPrev ? '1' : '0.5'};
                ">Previous</button>
                <button onclick="nextPage()" ${!hasNext ? 'disabled' : ''} style="
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 4px 12px;
                    cursor: ${hasNext ? 'pointer' : 'not-allowed'};
                    border-radius: 2px;
                    opacity: ${hasNext ? '1' : '0.5'};
                ">Next</button>
            </div>
        `
                : ''

        const viewDiffButton = `
            <div class="view-actions" style="margin: 10px 0; text-align: left; display: inline-block;">
                <button onclick="openDiff()" style="
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    margin: 0 5px;
                    cursor: pointer;
                    border-radius: 2px;
                ">View Diff</button>
            </div>
        `

        const deploymentButtons =
            this.changeSetName && this.enableDeployments
                ? `
            <div class="deployment-actions" style="margin: 10px 0; text-align: left; display: inline-block;">
                <button id="confirmDeploy" onclick="confirmDeploy()" style="
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    margin: 0 5px;
                    cursor: pointer;
                    border-radius: 2px;
                ">Deploy Changes</button>
                <button id="deleteChangeSet" onclick="deleteChangeSet()" style="
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    border: none;
                    padding: 8px 16px;
                    margin: 0 5px;
                    cursor: pointer;
                    border-radius: 2px;
                ">Delete Changeset</button>
            </div>
        `
                : ''

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        margin: 0;
                        padding: 0;
                        background-color: var(--vscode-panel-background);
                        color: var(--vscode-panel-foreground);
                    }
                    .content {
                        padding: 8px;
                    }
                    a {
                        color: var(--vscode-textLink-foreground);
                        cursor: pointer;
                        text-decoration: none;
                    }
                    a:hover {
                        text-decoration: underline;
                    }
                </style>
            </head>
            <body>
                ${paginationControls}
                <div class="content">
                    ${viewDiffButton}${deploymentButtons}
                    ${tableHtml}
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    function openDiff() {
                        vscode.postMessage({ command: '${webviewCommandOpenDiff}' });
                    }
                    function openDiffToResource(resourceId) {
                        vscode.postMessage({ command: '${webviewCommandOpenDiff}', resourceId: resourceId });
                    }
                    function confirmDeploy() {
                        vscode.postMessage({ command: 'confirmDeploy' });
                    }
                    function deleteChangeSet() {
                        vscode.postMessage({ command: 'deleteChangeSet' });
                    }
                    function toggleDetails(index) {
                        const detailsRow = document.getElementById('details-' + index);
                        const icon = document.getElementById('expand-icon-' + index);
                        if (detailsRow.style.display === 'none') {
                            detailsRow.style.display = 'table-row';
                            icon.textContent = '▼';
                        } else {
                            detailsRow.style.display = 'none';
                            icon.textContent = '▶';
                        }
                    }
                    function nextPage() {
                        vscode.postMessage({ command: 'nextPage' });
                    }
                    function prevPage() {
                        vscode.postMessage({ command: 'prevPage' });
                    }
                </script>
            </body>
            </html>
        `
    }
}
