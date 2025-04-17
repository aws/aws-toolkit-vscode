/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { VueWebview } from '../../../webviews/main'
import { CodeScanIssue } from '../../models/model'
import {
    CodeFixAction,
    CodewhispererCodeScanIssueApplyFix,
    Component,
    telemetry,
} from '../../../shared/telemetry/telemetry'
import { copyToClipboard } from '../../../shared/utilities/messages'
import { EditorContentController } from '../../../amazonq/commons/controllers/contentController'
import { SecurityIssueProvider } from '../../service/securityIssueProvider'
import { getPatchedCode, previewDiff } from '../../../shared/utilities/diffUtils'
import { amazonqCodeIssueDetailsTabTitle } from '../../models/constants'
import { AuthUtil } from '../../util/authUtil'
import { Mutable } from '../../../shared/utilities/tsUtils'
import { ExtContext } from '../../../shared/extensions'

export class SecurityIssueWebview extends VueWebview {
    public static readonly sourcePath: string = 'src/codewhisperer/views/securityIssue/vue/index.js'
    public readonly id = 'aws.codeWhisperer.securityIssue'
    public readonly onChangeIssue = new vscode.EventEmitter<CodeScanIssue | undefined>()
    public readonly onChangeFilePath = new vscode.EventEmitter<string | undefined>()
    public readonly onChangeGenerateFixLoading = new vscode.EventEmitter<boolean>()
    public readonly onChangeGenerateFixError = new vscode.EventEmitter<string | null | undefined>()

    private issue: CodeScanIssue | undefined
    private filePath: string | undefined
    private isGenerateFixLoading: boolean = false
    private generateFixError: string | null | undefined = undefined

    public constructor() {
        super(SecurityIssueWebview.sourcePath)
    }

    public getIssue() {
        return this.issue
    }

    public setIssue(issue: CodeScanIssue) {
        this.issue = issue
        this.onChangeIssue.fire(issue)
    }

    public setFilePath(filePath: string) {
        this.filePath = filePath
        this.onChangeFilePath.fire(filePath)
    }

    public applyFix() {
        const args: [CodeScanIssue | undefined, string | undefined, Component] = [this.issue, this.filePath, 'webview']
        void vscode.commands.executeCommand('aws.amazonq.applySecurityFix', ...args)
    }

    public explainWithQ() {
        const args = [this.issue]
        void this.navigateToFile()?.then(() => {
            void vscode.commands.executeCommand('aws.amazonq.explainIssue', ...args)
        })
    }

    public getRelativePath() {
        if (this.filePath) {
            return vscode.workspace.asRelativePath(this.filePath)
        }
        return ''
    }

    public navigateToFile(showRange = true) {
        if (this.issue && this.filePath) {
            const range = new vscode.Range(this.issue.startLine, 0, this.issue.endLine, 0)
            return vscode.workspace.openTextDocument(this.filePath).then((doc) => {
                void vscode.window.showTextDocument(doc, {
                    selection: showRange ? range : undefined,
                    viewColumn: vscode.ViewColumn.One,
                    preview: true,
                })
            })
        }
    }

    public closeWebview(findingId: string) {
        if (this.issue?.findingId === findingId) {
            this.dispose()
        }
    }

    public getIsGenerateFixLoading() {
        return this.isGenerateFixLoading
    }

    public setIsGenerateFixLoading(isGenerateFixLoading: boolean) {
        this.isGenerateFixLoading = isGenerateFixLoading
        this.onChangeGenerateFixLoading.fire(isGenerateFixLoading)
    }

    public getGenerateFixError() {
        return this.generateFixError
    }

    public setGenerateFixError(generateFixError: string | null | undefined) {
        this.generateFixError = generateFixError
        this.onChangeGenerateFixError.fire(generateFixError)
    }

    public generateFix() {
        void vscode.commands.executeCommand('aws.amazonq.security.generateFix', this.issue, this.filePath, 'webview')
    }

    public regenerateFix() {
        void vscode.commands.executeCommand('aws.amazonq.security.regenerateFix', this.issue, this.filePath, 'webview')
    }

    public rejectFix() {
        void vscode.commands.executeCommand('aws.amazonq.security.rejectFix', this.issue, this.filePath)
    }

    public ignoreIssue() {
        void vscode.commands.executeCommand('aws.amazonq.security.ignore', this.issue, this.filePath, 'webview')
    }

    public ignoreAllIssues() {
        void vscode.commands.executeCommand('aws.amazonq.security.ignoreAll', this.issue, 'webview')
    }

    createApplyFixTelemetryEntry(fixAction: CodeFixAction): Mutable<CodewhispererCodeScanIssueApplyFix> {
        return {
            detectorId: this.issue!.detectorId,
            findingId: this.issue!.findingId,
            ruleId: this.issue!.ruleId,
            component: 'webview',
            result: 'Succeeded',
            credentialStartUrl: AuthUtil.instance.connection?.startUrl,
            codeFixAction: fixAction,
        }
    }

    public async copyFixedCode() {
        telemetry.ui_click.emit({ elementId: 'codeReviewGeneratedFix_copyCodeFix' })
        const fixedCode = await this.getFixedCode()
        if (!fixedCode || fixedCode.length === 0) {
            return
        }
        void copyToClipboard(fixedCode, 'suggested code fix')
        const copyFixedCodeTelemetryEntry = this.createApplyFixTelemetryEntry('copyDiff')
        telemetry.codewhisperer_codeScanIssueApplyFix.emit(copyFixedCodeTelemetryEntry)
    }

    public async insertAtCursor() {
        telemetry.ui_click.emit({ elementId: 'codeReviewGeneratedFix_insertCodeFixAtCursor' })
        const fixedCode = await this.getFixedCode()
        if (!fixedCode || fixedCode.length === 0) {
            return
        }
        const controller = new EditorContentController()
        await this.navigateToFile(false)
        controller.insertTextAtCursorPosition(fixedCode, () => {})
        const copyFixedCodeTelemetryEntry = this.createApplyFixTelemetryEntry('insertAtCursor')
        telemetry.codewhisperer_codeScanIssueApplyFix.emit(copyFixedCodeTelemetryEntry)
    }

    public async openDiff() {
        telemetry.ui_click.emit({ elementId: 'codeReviewGeneratedFix_openCodeFixDiff' })
        const [suggestedFix] = this.issue?.suggestedFixes ?? []
        if (!this.filePath || !suggestedFix || !suggestedFix.code) {
            return
        }
        await previewDiff(this.filePath, suggestedFix.code)
        const copyFixedCodeTelemetryEntry = this.createApplyFixTelemetryEntry('openDiff')
        telemetry.codewhisperer_codeScanIssueApplyFix.emit(copyFixedCodeTelemetryEntry)
    }

    public async getLanguageId() {
        if (!this.filePath) {
            return
        }
        const document = await vscode.workspace.openTextDocument(this.filePath)
        return document.languageId
    }

    public async getFixedCode(snippetMode = true) {
        const [suggestedFix] = this.issue?.suggestedFixes ?? []
        if (!this.filePath || !suggestedFix || !suggestedFix.code || !this.issue) {
            return ''
        }
        const patchedCode = await getPatchedCode(this.filePath, suggestedFix.code, snippetMode)
        return patchedCode
    }
}

const Panel = VueWebview.compilePanel(SecurityIssueWebview)
let activePanel: InstanceType<typeof Panel> | undefined

export async function showSecurityIssueWebview(ctx: vscode.ExtensionContext, issue: CodeScanIssue, filePath: string) {
    activePanel ??= new Panel(ctx)
    activePanel.server.setIssue(issue)
    activePanel.server.setFilePath(filePath)
    activePanel.server.setIsGenerateFixLoading(false)
    activePanel.server.setGenerateFixError(undefined)

    const webviewPanel = await activePanel.show({
        title: amazonqCodeIssueDetailsTabTitle,
        viewColumn: vscode.ViewColumn.Beside,
        cssFiles: ['securityIssue.css'],
    })
    webviewPanel.iconPath = {
        light: vscode.Uri.joinPath(ctx.extensionUri, 'resources/icons/aws/amazonq/q-squid-ink.svg'),
        dark: vscode.Uri.joinPath(ctx.extensionUri, 'resources/icons/aws/amazonq/q-white.svg'),
    }

    webviewPanel.onDidDispose(() => (activePanel = undefined))
}

export function isSecurityIssueWebviewOpen() {
    return activePanel !== undefined
}

export async function closeSecurityIssueWebview(findingId: string) {
    activePanel?.server.closeWebview(findingId)
}

export async function syncSecurityIssueWebview(context: ExtContext) {
    const activeIssueId = activePanel?.server.getIssue()?.findingId
    if (!activeIssueId) {
        return
    }
    const updatedIssue = SecurityIssueProvider.instance.issues
        .flatMap(({ issues }) => issues)
        .find((issue) => issue.findingId === activeIssueId)
    await updateSecurityIssueWebview({
        issue: updatedIssue,
        context: context.extensionContext,
        shouldRefreshView: false,
    })
}

export async function getWebviewActiveIssueId() {
    return activePanel?.server.getIssue()?.findingId
}

type WebviewParams = {
    issue?: CodeScanIssue
    filePath?: string
    isGenerateFixLoading?: boolean
    generateFixError?: string | null
    shouldRefreshView: boolean
    context: vscode.ExtensionContext
}
export async function updateSecurityIssueWebview({
    issue,
    filePath,
    isGenerateFixLoading,
    generateFixError,
    shouldRefreshView,
    context,
}: WebviewParams): Promise<void> {
    if (!activePanel) {
        return
    }
    if (issue) {
        activePanel.server.setIssue(issue)
    }
    if (filePath) {
        activePanel.server.setFilePath(filePath)
    }
    if (isGenerateFixLoading !== undefined) {
        activePanel.server.setIsGenerateFixLoading(isGenerateFixLoading)
    }
    if (generateFixError !== undefined) {
        activePanel.server.setGenerateFixError(generateFixError)
    }
    if (shouldRefreshView && filePath && issue) {
        await showSecurityIssueWebview(context, issue, filePath)
    }
}

export function getIsGenerateFixLoading() {
    return activePanel?.server.getIsGenerateFixLoading()
}
