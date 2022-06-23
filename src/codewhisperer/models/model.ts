/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as telemetry from '../../shared/telemetry/telemetry'
import * as vscode from 'vscode'
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
    readonly triggerType: telemetry.CodewhispererTriggerType
    readonly completionType: telemetry.CodewhispererCompletionType
    readonly language: telemetry.CodewhispererLanguage
}

export interface OnRecommendationAcceptanceEntry {
    readonly editor: vscode.TextEditor | undefined
    readonly range: vscode.Range
    readonly acceptIndex: number
    readonly recommendation: string
    readonly requestId: string
    readonly sessionId: string
    readonly triggerType: telemetry.CodewhispererTriggerType
    readonly completionType: telemetry.CodewhispererCompletionType
    readonly language: telemetry.CodewhispererLanguage
    readonly references: References | undefined
}

export interface ConfigurationEntry {
    readonly isShowMethodsEnabled: boolean
    readonly isManualTriggerEnabled: boolean
    readonly isAutomatedTriggerEnabled: boolean
    readonly isIncludeSuggestionsWithCodeReferencesEnabled: boolean
}

export interface InlineCompletionItem {
    content: string
    index: number
}

/**
 * Security Scan Interfaces
 */

export interface CodeScanState {
    running: boolean
}

export const codeScanState: CodeScanState = {
    running: false,
}

export interface CodeScanTelemetryEntry {
    codewhispererCodeScanJobId?: string
    codewhispererLanguage: telemetry.CodewhispererLanguage
    codewhispererCodeScanPayloadBytes: number
    codewhispererCodeScanLines: number
    duration: number
    result: telemetry.Result
    reason?: string
    codewhispererCodeScanTotalIssues: number
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
