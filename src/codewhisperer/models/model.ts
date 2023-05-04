/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { ToolkitError } from '../../shared/errors'
import { getIcon } from '../../shared/icons'
import {
    CodewhispererCompletionType,
    CodewhispererLanguage,
    CodewhispererTriggerType,
    Result,
} from '../../shared/telemetry/telemetry'
import { References } from '../client/codewhisperer'

// unavoidable global variables
interface VsCodeState {
    /**
     * Flag indicates intelli sense pop up is active or not
     * Adding this since VS Code intelliSense API does not expose this variable
     */
    isIntelliSenseActive: boolean
    /**
     * Flag indicates whether codewhisperer is doing vscode.TextEditor.edit
     */
    isCodeWhispererEditing: boolean
    /**
     * Timestamp of previous user edit
     */
    lastUserModificationTime: number
}

export const vsCodeState: VsCodeState = {
    isIntelliSenseActive: false,
    isCodeWhispererEditing: false,
    lastUserModificationTime: 0,
}

export interface AcceptedSuggestionEntry {
    readonly time: Date
    readonly fileUrl: vscode.Uri
    readonly originalString: string
    readonly startPosition: vscode.Position
    readonly endPosition: vscode.Position
    readonly requestId: string
    readonly sessionId: string
    readonly index: number
    readonly triggerType: CodewhispererTriggerType
    readonly completionType: CodewhispererCompletionType
    readonly language: CodewhispererLanguage
}

export interface OnRecommendationAcceptanceEntry {
    readonly editor: vscode.TextEditor | undefined
    readonly range: vscode.Range
    readonly acceptIndex: number
    readonly recommendation: string
    readonly requestId: string
    readonly sessionId: string
    readonly triggerType: CodewhispererTriggerType
    readonly completionType: CodewhispererCompletionType
    readonly language: CodewhispererLanguage
    readonly references: References | undefined
}

export interface ConfigurationEntry {
    readonly isShowMethodsEnabled: boolean
    readonly isManualTriggerEnabled: boolean
    readonly isAutomatedTriggerEnabled: boolean
    readonly isSuggestionsWithCodeReferencesEnabled: boolean
}

export interface InlineCompletionItem {
    content: string
    index: number
}

/**
 * Security Scan Interfaces
 */
enum CodeScanStatus {
    NotStarted,
    Running,
    Cancelling,
}

export class CodeScanState {
    // Define a constructor for this class
    private codeScanState: CodeScanStatus = CodeScanStatus.NotStarted

    public isNotStarted() {
        return this.codeScanState === CodeScanStatus.NotStarted
    }

    public isRunning() {
        return this.codeScanState === CodeScanStatus.Running
    }

    public isCancelling() {
        return this.codeScanState === CodeScanStatus.Cancelling
    }

    public setToNotStarted() {
        this.codeScanState = CodeScanStatus.NotStarted
    }

    public setToCancelling() {
        this.codeScanState = CodeScanStatus.Cancelling
    }

    public setToRunning() {
        this.codeScanState = CodeScanStatus.Running
    }

    public getPrefixTextForButton() {
        switch (this.codeScanState) {
            case CodeScanStatus.NotStarted:
                return 'Run'
            case CodeScanStatus.Running:
                return 'Stop'
            case CodeScanStatus.Cancelling:
                return 'Stopping'
        }
    }

    public getIconForButton() {
        switch (this.codeScanState) {
            case CodeScanStatus.NotStarted:
                return getIcon('vscode-debug-alt-small')
            case CodeScanStatus.Running:
                return getIcon('vscode-stop-circle')
            case CodeScanStatus.Cancelling:
                return getIcon('vscode-icons:loading~spin')
        }
    }
}

export const codeScanState: CodeScanState = new CodeScanState()

export class CodeScanStoppedError extends ToolkitError {
    constructor() {
        super('Security scan stopped by user.', { cancelled: true })
    }
}

export interface CodeScanTelemetryEntry {
    codewhispererCodeScanJobId?: string
    codewhispererLanguage: CodewhispererLanguage
    codewhispererCodeScanProjectBytes?: number
    codewhispererCodeScanSrcPayloadBytes: number
    codewhispererCodeScanBuildPayloadBytes?: number
    codewhispererCodeScanSrcZipFileBytes: number
    codewhispererCodeScanBuildZipFileBytes?: number
    codewhispererCodeScanLines: number
    duration: number
    contextTruncationDuration: number
    artifactsUploadDuration: number
    codeScanServiceInvocationsDuration: number
    result: Result
    reason?: string
    codewhispererCodeScanTotalIssues: number
    credentialStartUrl: string | undefined
}

export interface RawCodeScanIssue {
    filePath: string
    startLine: number
    endLine: number
    title: string
    description: {
        text: string
        markdown: string
    }
}

export interface CodeScanIssue {
    startLine: number
    endLine: number
    comment: string
}

export interface AggregatedCodeScanIssue {
    filePath: string
    issues: CodeScanIssue[]
}

export interface SecurityPanelItem {
    path: string
    range: vscode.Range
    severity: vscode.DiagnosticSeverity
    message: string
    issue: CodeScanIssue
    decoration: vscode.DecorationOptions
}

export interface SecurityPanelSet {
    path: string
    uri: vscode.Uri
    items: SecurityPanelItem[]
}

export enum Cloud9AccessState {
    NoAccess,
    RequestedAccess,
    HasAccess,
}
