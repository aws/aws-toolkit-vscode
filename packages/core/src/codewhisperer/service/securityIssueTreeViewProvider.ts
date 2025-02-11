/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import path from 'path'
import {
    CodeIssueGroupingStrategy,
    CodeIssueGroupingStrategyState,
    CodeScanIssue,
    SecurityTreeViewFilterState,
    severities,
    Severity,
} from '../models/model'
import globals from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger/logger'
import { SecurityIssueProvider } from './securityIssueProvider'

export type SecurityViewTreeItem = FileItem | IssueItem | SeverityItem
type CodeScanIssueWithFilePath = CodeScanIssue & { filePath: string }

export class SecurityIssueTreeViewProvider implements vscode.TreeDataProvider<SecurityViewTreeItem> {
    public static readonly viewType = 'aws.amazonq.SecurityIssuesTree'

    private _onDidChangeTreeData: vscode.EventEmitter<
        SecurityViewTreeItem | SecurityViewTreeItem[] | undefined | null | void
    > = new vscode.EventEmitter<SecurityViewTreeItem | SecurityViewTreeItem[] | undefined | null | void>()
    readonly onDidChangeTreeData: vscode.Event<
        SecurityViewTreeItem | SecurityViewTreeItem[] | undefined | null | void
    > = this._onDidChangeTreeData.event

    static #instance: SecurityIssueTreeViewProvider
    private issueProvider = SecurityIssueProvider.instance

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public getTreeItem(element: SecurityViewTreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element
    }

    public getChildren(element?: SecurityViewTreeItem | undefined): vscode.ProviderResult<SecurityViewTreeItem[]> {
        const groupingStrategy = CodeIssueGroupingStrategyState.instance.getState()
        switch (groupingStrategy) {
            case CodeIssueGroupingStrategy.FileLocation:
                return this.getChildrenGroupedByFileLocation(element)
            case CodeIssueGroupingStrategy.Severity:
            default:
                return this.getChildrenGroupedBySeverity(element)
        }
    }

    private getChildrenGroupedBySeverity(element: SecurityViewTreeItem | undefined) {
        const filterHiddenSeverities = (severity: Severity) =>
            !SecurityTreeViewFilterState.instance.getHiddenSeverities().includes(severity)

        if (element instanceof SeverityItem) {
            return element.issues
                .filter((issue) => issue.visible)
                .sort((a, b) => a.filePath.localeCompare(b.filePath) || a.startLine - b.startLine)
                .map((issue) => new IssueItem(issue.filePath, issue))
        }
        const result = severities.filter(filterHiddenSeverities).map(
            (severity) =>
                new SeverityItem(
                    severity,
                    this.issueProvider.issues.reduce(
                        (accumulator, current) =>
                            accumulator.concat(
                                current.issues
                                    .filter((issue) => issue.severity === severity)
                                    .filter((issue) => issue.visible)
                                    .map((issue) => ({ ...issue, filePath: current.filePath }))
                            ),
                        [] as CodeScanIssueWithFilePath[]
                    )
                )
        )

        this._onDidChangeTreeData.fire(result)
        return result
    }

    private getChildrenGroupedByFileLocation(element: SecurityViewTreeItem | undefined) {
        const filterHiddenSeverities = (issue: CodeScanIssue) =>
            !SecurityTreeViewFilterState.instance.getHiddenSeverities().includes(issue.severity)

        if (element instanceof FileItem) {
            return element.issues
                .filter(filterHiddenSeverities)
                .filter((issue) => issue.visible)
                .sort((a, b) => a.startLine - b.startLine)
                .map((issue) => new IssueItem(element.filePath, issue))
        }

        const result = this.issueProvider.issues
            .filter((group) => group.issues.some(filterHiddenSeverities))
            .filter((group) => group.issues.some((issue) => issue.visible))
            .sort((a, b) => a.filePath.localeCompare(b.filePath))
            .map((group) => new FileItem(group.filePath, group.issues.filter(filterHiddenSeverities)))
        this._onDidChangeTreeData.fire(result)
        return result
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire()
    }

    public static focus() {
        void vscode.commands.executeCommand('aws.amazonq.SecurityIssuesTree.focus').then(undefined, (e) => {
            getLogger().error('SecurityIssuesTree focus failed: %s', e.message)
        })
    }
}

enum ContextValue {
    FILE = 'file',
    ISSUE_WITH_FIX = 'issueWithFix',
    ISSUE_WITHOUT_FIX = 'issueWithoutFix',
    SEVERITY = 'severity',
}

export class SeverityItem extends vscode.TreeItem {
    constructor(
        public readonly severity: string,
        public readonly issues: CodeScanIssueWithFilePath[]
    ) {
        super(severity)
        this.description = `${this.issues.length} ${this.issues.length === 1 ? 'issue' : 'issues'}`
        this.iconPath = this.getSeverityIcon()
        this.contextValue = ContextValue.SEVERITY
        this.collapsibleState = this.getCollapsibleState()
    }

    private getSeverityIcon() {
        return globals.context.asAbsolutePath(`resources/icons/aws/amazonq/severity-${this.severity.toLowerCase()}.svg`)
    }

    private getCollapsibleState() {
        return this.severity === 'Critical' || this.severity === 'High'
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed
    }
}

export class FileItem extends vscode.TreeItem {
    constructor(
        public readonly filePath: string,
        public readonly issues: CodeScanIssue[]
    ) {
        super(path.basename(filePath), vscode.TreeItemCollapsibleState.Expanded)
        this.resourceUri = vscode.Uri.file(this.filePath)
        this.description = vscode.workspace.asRelativePath(path.dirname(this.filePath))
        this.iconPath = new vscode.ThemeIcon('file')
        this.contextValue = ContextValue.FILE
    }
}

export class IssueItem extends vscode.TreeItem {
    constructor(
        public readonly filePath: string,
        public readonly issue: CodeScanIssue
    ) {
        super(issue.title, vscode.TreeItemCollapsibleState.None)
        this.description = this.getDescription()
        this.iconPath = this.getSeverityIcon()
        this.tooltip = this.getTooltipMarkdown()
        this.command = {
            title: 'Focus Issue',
            command: 'aws.amazonq.security.focusIssue',
            arguments: [this.issue, this.filePath],
        }
        this.contextValue = this.getContextValue()
    }

    private getSeverityImage() {
        return globals.context.asAbsolutePath(`resources/images/severity-${this.issue.severity.toLowerCase()}.svg`)
    }

    private getSeverityIcon() {
        const iconPath = globals.context.asAbsolutePath(
            `resources/icons/aws/amazonq/severity-${this.issue.severity.toLowerCase()}.svg`
        )
        const groupingStrategy = CodeIssueGroupingStrategyState.instance.getState()
        return groupingStrategy !== CodeIssueGroupingStrategy.Severity ? iconPath : undefined
    }

    private getDescription() {
        const positionStr = `[Ln ${this.issue.startLine + 1}, Col 1]`
        const groupingStrategy = CodeIssueGroupingStrategyState.instance.getState()
        return groupingStrategy !== CodeIssueGroupingStrategy.FileLocation
            ? `${path.basename(this.filePath)} ${positionStr}`
            : positionStr
    }

    private getContextValue() {
        return this.issue.suggestedFixes.length === 0 || !this.issue.suggestedFixes[0].code
            ? ContextValue.ISSUE_WITHOUT_FIX
            : ContextValue.ISSUE_WITH_FIX
    }

    private getTooltipMarkdown() {
        const markdown = new vscode.MarkdownString()
        markdown.isTrusted = true
        markdown.supportHtml = true
        markdown.supportThemeIcons = true
        markdown.appendMarkdown(`## ${this.issue.title} ![${this.issue.severity}](${this.getSeverityImage()})\n`)
        markdown.appendMarkdown(this.issue.recommendation.text)

        return markdown
    }
}
