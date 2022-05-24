/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as telemetry from '../../../shared/telemetry/telemetry'
import * as vscode from 'vscode'
import { RecommendationsList, References, RecommendationDetail } from '../client/consolas'
import { ConsolasConstants } from './constants'

//if this is browser it uses browser and if it's node then it uses nodes
//TODO remove when node version >= 16
const performance = globalThis.performance ?? require('perf_hooks').performance

interface Recommendations {
    requestId: string
    /**
     * Recommendations queue
     */
    response: RecommendationsList
    // user facing error message
    errorCode: string
}

export const recommendations: Recommendations = {
    response: [],
    requestId: '',
    errorCode: '',
}

interface InvocationContext {
    /**
     * Flag indicates intelli sense pop up is active or not
     */
    isIntelliSenseActive: boolean
    /**
     * Flag indicates invocation is in progress
     */
    isPendingResponse: boolean
    /**
     * Last invocation time
     */
    lastInvocationTime: number
    /**
     * Invocation start position
     */
    startPos: vscode.Position
    /**
     * Flag indicates whether consolas is doing text edit
     */
    isConsolasEditing: boolean
    /**
     * Flag indicates whether typeahead of current inline recommendation is in progress
     */
    isTypeaheadInProgress: boolean
}

export const invocationContext: InvocationContext = {
    isIntelliSenseActive: false,
    isPendingResponse: false,
    isConsolasEditing: false,
    isTypeaheadInProgress: false,
    /**
     * Initialize lastInvocationTime (ms) by performance.now() - "duration threshold" x 1000 ms
     */
    lastInvocationTime: performance.now() - ConsolasConstants.invocationTimeIntervalThreshold * 1000,
    startPos: new vscode.Position(0, 0),
}

interface TelemetryContext {
    /**
     * to record each recommendation is prefix matched or not with
     * left context before 'editor.action.triggerSuggest'
     */
    isPrefixMatched: boolean[]
    /**
     * Trigger type for getting Consolas recommendation
     */
    triggerType: telemetry.ConsolasTriggerType
    /**
     * Auto Trigger Type for getting event of Automated Trigger
     */
    ConsolasAutomatedtriggerType: telemetry.ConsolasAutomatedtriggerType
    /**
     * completion Type of the consolas recommendation, line vs block
     */
    completionType: telemetry.ConsolasCompletionType
    /**
     * the cursor offset location at invocation time
     */
    cursorOffset: number
}

export const telemetryContext: TelemetryContext = {
    isPrefixMatched: [],
    triggerType: 'OnDemand',
    ConsolasAutomatedtriggerType: 'KeyStrokeCount',
    completionType: 'Line',
    cursorOffset: 0,
}

interface AutomatedTriggerContext {
    /**
     * Speical character which automated triggers consolas
     */
    specialChar: string
    /**
     * Key stroke count for automated trigger
     */
    keyStrokeCount: number
}

export const automatedTriggerContext: AutomatedTriggerContext = {
    specialChar: '',
    keyStrokeCount: 0,
}

export interface AcceptedSuggestionEntry {
    readonly time: Date
    readonly fileUrl: vscode.Uri
    readonly originalString: string
    readonly startPosition: vscode.Position
    readonly endPosition: vscode.Position
    readonly requestId: string
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

interface InlineCompletion {
    items: InlineCompletionItem[]
    origin: RecommendationDetail[]
    position: number
}
export const inlineCompletion: InlineCompletion = {
    items: [],
    origin: [],
    position: 0,
}
