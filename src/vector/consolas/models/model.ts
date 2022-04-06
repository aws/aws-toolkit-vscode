/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as telemetry from '../../../shared/telemetry/telemetry'
import * as vscode from 'vscode'
import { RecommendationsList } from '../client/consolas'
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
}

export const recommendations: Recommendations = {
    response: [],
    requestId: '',
}

interface InvocationContext {
    /**
     * Flag indicates completion menu is active or not
     */
    isActive: boolean
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
}

export const invocationContext: InvocationContext = {
    isActive: false,
    isPendingResponse: false,
    /**
     * Initialize lastInvocationTime (ms) by performance.now() - "duration threshold" x 1000 ms
     */
    lastInvocationTime: performance.now() - ConsolasConstants.INVOCATION_TIME_INTERVAL_THRESHOLD * 1000,
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
    readonly line: number
    readonly acceptIndex: number
    readonly recommendation: string
    readonly requestId: string
    readonly triggerType: telemetry.ConsolasTriggerType
    readonly completionType: telemetry.ConsolasCompletionType
    readonly language: telemetry.ConsolasLanguage
}
