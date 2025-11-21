/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebviewView, WebviewViewProvider, commands, Disposable } from 'vscode'
import { DeploymentMode, StackChange, ValidationDetail } from '../stacks/actions/stackActionRequestType'
import { DiffViewHelper } from './diffViewHelper'
import { commandKey } from '../utils'
import { StackViewCoordinator } from './stackViewCoordinator'
import { showWarningConfirmation } from './message'
import { ChangeSetStatus } from '@aws-sdk/client-cloudformation'

const webviewCommandOpenDiff = 'openDiff'

export class DiffWebviewProvider implements WebviewViewProvider, Disposable {
    private _view?: WebviewView
    private stackName = ''
    private changes: StackChange[] = []
    private changeSetName?: string
    private enableDeployments: boolean = false
    private currentPage: number = 0
    private pageSize: number = 50
    private totalPages: number = 0
    private readonly disposables: Disposable[] = []
    private validationDetail: ValidationDetail[] = []
    private deploymentMode?: DeploymentMode
    private changeSetStatus?: string

    constructor(private readonly coordinator: StackViewCoordinator) {
        this.disposables.push(
            coordinator.onDidChangeStack((state) => {
                if (!state.isChangeSetMode) {
                    this.stackName = ''
                    this.changes = []
                    this.changeSetName = undefined
                    if (this._view) {
                        this._view.webview.html = this.getHtmlContent()
                    }
                }
            })
        )
    }

    async updateData(
        stackName: string,
        changes: StackChange[] = [],
        changeSetName?: string,
        enableDeployments = false,
        validationDetail?: ValidationDetail[],
        deploymentMode?: DeploymentMode,
        changeSetStatus?: string
    ) {
        this.stackName = stackName
        this.changes = changes
        this.changeSetName = changeSetName
        this.enableDeployments = enableDeployments
        this.currentPage = 0
        this.totalPages = Math.ceil(changes.length / this.pageSize)
        if (validationDetail) {
            this.validationDetail = validationDetail
        }
        this.deploymentMode = deploymentMode
        this.changeSetStatus = changeSetStatus

        await this.coordinator.setChangeSetMode(stackName, true)
        if (this._view) {
            this._view.webview.html = this.getHtmlContent()
        }
    }

    resolveWebviewView(webviewView: WebviewView) {
        this._view = webviewView
        webviewView.webview.options = { enableScripts: true }
        webviewView.webview.html = this.getHtmlContent()

        webviewView.webview.onDidReceiveMessage(async (message: { command: string; resourceId?: string }) => {
            if (message.command === webviewCommandOpenDiff) {
                void DiffViewHelper.openDiff(this.stackName, this.changes, message.resourceId)
            } else if (message.command === 'confirmDeploy') {
                if (this.changeSetName) {
                    const errorCount = this.getErrorCount()
                    const warningCount = this.getWarningCount()

                    if (errorCount === 0 && warningCount > 0) {
                        const proceed = await showWarningConfirmation(warningCount)
                        if (!proceed) {
                            return
                        }
                    }

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

        const deletionButton = `
        <button id="deleteChangeSet" onclick="deleteChangeSet()" style="
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 8px 16px;
            margin: 0 5px;
            cursor: pointer;
            border-radius: 2px;
        ">Delete Changeset</button>
        `

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
                    ${
                        this.changeSetName &&
                        (this.changeSetStatus === ChangeSetStatus.CREATE_COMPLETE ||
                            this.changeSetStatus === ChangeSetStatus.FAILED)
                            ? `
                    <div class="deletion-button" style="margin: 10px 0; text-align: left; display: inline-block;">
                        ${deletionButton}
                    </div>
                    <script>
                        const vscode = acquireVsCodeApi();
                        function deleteChangeSet() {
                            vscode.postMessage({ command: 'deleteChangeSet' });
                        }
                    </script>
                    `
                            : ''
                    }
                </body>
                </html>
            `
        }

        // Check if REVERT_DRIFT change set or any resource has drift
        // TODO: adapt if we do real backend pagination
        // TODO: remove resource fallback once server is passing deploymentMode
        const hasDrift =
            this.deploymentMode === DeploymentMode.REVERT_DRIFT ||
            changes.some(
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
            const expandIcon = hasDetails
                ? '<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle;"><path d="M5 2L11 8L5 14" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linejoin="round"/></svg>'
                : ''

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
                top: ${this.getWarningCount() > 0 ? '40px' : '0'};
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

        const warningBanner =
            this.getWarningCount() > 0
                ? `
            <div class="warning-banner" style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                z-index: 11;
                background: var(--vscode-editorWarning-background);
                color: var(--vscode-editorWarning-foreground);
                padding: 8px 16px;
                border-bottom: 1px solid var(--vscode-panel-border);
                text-align: center;
                font-weight: bold;
            ">
                ⚠️ ${this.getWarningCount()} warning(s) found
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
            this.changeSetName &&
            this.enableDeployments &&
            (this.changeSetStatus === ChangeSetStatus.CREATE_COMPLETE ||
                this.changeSetStatus === ChangeSetStatus.FAILED)
                ? `
            <div class="deployment-actions" style="margin: 10px 0; text-align: left; display: inline-block;">
                ${
                    this.changeSetStatus === ChangeSetStatus.CREATE_COMPLETE
                        ? `
                <button id="confirmDeploy" onclick="confirmDeploy()" style="
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    margin: 0 5px;
                    cursor: pointer;
                    border-radius: 2px;
                ">Deploy Changes</button>`
                        : ''
                }
                ${deletionButton}
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
                        margin-top: ${this.getWarningCount() > 0 ? '40px' : '0'};
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
                ${warningBanner}
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
                        // https://cloudscape.design/foundation/visual-foundation/iconography/ angle-right angle-down
                        if (detailsRow.style.display === 'none') {
                            detailsRow.style.display = 'table-row';
                            icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle;"><path d="M2 5L8 11L14 5" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linejoin="round"/></svg>';
                        } else {
                            detailsRow.style.display = 'none';
                            icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle;"><path d="M5 2L11 8L5 14" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linejoin="round"/></svg>';
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

    private getWarningCount(): number {
        return this.validationDetail.filter((detail) => detail.Severity === 'INFO').length
    }

    private getErrorCount(): number {
        return this.validationDetail.filter((detail) => detail.Severity === 'ERROR').length
    }

    dispose(): void {
        for (const d of this.disposables) {
            d.dispose()
        }
    }
}
