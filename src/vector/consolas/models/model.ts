/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as telemetry from '../../../shared/telemetry/telemetry'
import * as vscode from 'vscode'
import { References } from '../client/consolas'

// unavoidable global variables
interface VsCodeState {
    /**
     * Flag indicates intelli sense pop up is active or not
     * Adding this since VS Code intelliSense API does not expose this variable
     */
    isIntelliSenseActive: boolean
    /**
     * Flag indicates whether consolas is doing vscode.TextEditor.edit
     */
    isConsolasEditing: boolean
    /**
     * Timestamp of previous user edit
     */
    lastUserModificationTime: number
}

export const vsCodeState: VsCodeState = {
    isIntelliSenseActive: false,
    isConsolasEditing: false,
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
    readonly triggerType: telemetry.ConsolasTriggerType
    readonly completionType: telemetry.ConsolasCompletionType
    readonly language: telemetry.ConsolasLanguage
    readonly languageRuntime: telemetry.ConsolasRuntime
    readonly languageRuntimeSource: string
}

export interface OnRecommendationAcceptanceEntry {
    readonly editor: vscode.TextEditor | undefined
    readonly range: vscode.Range
    readonly acceptIndex: number
    readonly recommendation: string
    readonly requestId: string
    readonly sessionId: string
    readonly triggerType: telemetry.ConsolasTriggerType
    readonly completionType: telemetry.ConsolasCompletionType
    readonly language: telemetry.ConsolasLanguage
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

export interface CodeScanTelemetryEntry {
    consolasCodeScanJobId?: string
    consolasLanguage: telemetry.ConsolasLanguage
    consolasCodeScanPayloadSize: number
    consolasCodeScanLines: number
    duration: number
    result: telemetry.Result
    reason?: string
    consolasCodeScanTotalIssues: number
}

export interface RawCodeScanIssue {
    repoName: string
    filePath: string
    startLine: number
    endLine: number
    lineToHighlight: number
    comment: string
    detectorId: string
    confidenceScore: number
    recommendationId: string
    recommendationType: string
    ruleManifestId: string
    filePathType: string
    recommendationMetadata: {
        ruleId: string
        ruleManifestId: string
        name: string
        longDescription: string
        tags: string
        cwes: string
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
