/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    CodewhispererCompletionType,
    CodewhispererLanguage,
    CodewhispererGettingStartedTask,
    CodewhispererAutomatedTriggerType,
    CodewhispererTriggerType,
} from '../../shared/telemetry/telemetry.gen'
import { GenerateRecommendationsRequest, ListRecommendationsRequest, Recommendation } from '../client/codewhisperer'
import { Position } from 'vscode'
import { CodeWhispererSupplementalContext, vsCodeState } from '../models/model'
import { FileDiagnostic, getDiagnosticsOfCurrentFile } from './diagnosticsUtil'

class CodeWhispererSession {
    static #instance: CodeWhispererSession

    // Per-session states
    sessionId = ''
    requestIdList: string[] = []
    startPos = new Position(0, 0)
    startCursorOffset = 0
    leftContextOfCurrentLine = ''
    requestContext: {
        request: ListRecommendationsRequest | GenerateRecommendationsRequest
        supplementalMetadata: CodeWhispererSupplementalContext | undefined
    } = { request: {} as any, supplementalMetadata: {} as any }
    language: CodewhispererLanguage = 'python'
    taskType: CodewhispererGettingStartedTask | undefined
    triggerType: CodewhispererTriggerType = 'OnDemand'
    autoTriggerType: CodewhispererAutomatedTriggerType | undefined

    // Various states of recommendations
    recommendations: Recommendation[] = []
    suggestionStates = new Map<number, string>()
    completionTypes = new Map<number, CodewhispererCompletionType>()

    // Some other variables for client component latency
    fetchCredentialStartTime = 0
    sdkApiCallStartTime = 0
    invokeSuggestionStartTime = 0
    preprocessEndTime = 0
    timeToFirstRecommendation = 0
    firstSuggestionShowTime = 0
    perceivedLatency = 0
    diagnosticsBeforeAccept: FileDiagnostic | undefined = undefined

    public static get instance() {
        return (this.#instance ??= new CodeWhispererSession())
    }

    setFetchCredentialStart() {
        if (this.fetchCredentialStartTime === 0 && this.invokeSuggestionStartTime !== 0) {
            this.fetchCredentialStartTime = performance.now()
        }
    }

    setSdkApiCallStart() {
        if (this.sdkApiCallStartTime === 0 && this.fetchCredentialStartTime !== 0) {
            this.sdkApiCallStartTime = performance.now()
        }
    }

    setTimeToFirstRecommendation(timeToFirstRecommendation: number) {
        if (this.invokeSuggestionStartTime) {
            this.timeToFirstRecommendation = timeToFirstRecommendation - this.invokeSuggestionStartTime
        }
        this.diagnosticsBeforeAccept = getDiagnosticsOfCurrentFile()
    }

    setSuggestionState(index: number, value: string) {
        this.suggestionStates.set(index, value)
    }

    getSuggestionState(index: number): string | undefined {
        return this.suggestionStates.get(index)
    }

    setCompletionType(index: number, recommendation: Recommendation) {
        const nonBlankLines = recommendation.content.split('\n').filter((line) => line.trim() !== '').length
        this.completionTypes.set(index, nonBlankLines > 1 ? 'Block' : 'Line')
    }

    getCompletionType(index: number): CodewhispererCompletionType {
        return this.completionTypes.get(index) || 'Line'
    }

    getPerceivedLatency(triggerType: CodewhispererTriggerType) {
        if (triggerType === 'OnDemand') {
            return this.timeToFirstRecommendation
        } else {
            return session.firstSuggestionShowTime - vsCodeState.lastUserModificationTime
        }
    }

    setPerceivedLatency() {
        if (this.perceivedLatency !== 0) {
            return
        }
        if (this.triggerType === 'OnDemand') {
            this.perceivedLatency = this.timeToFirstRecommendation
        } else {
            this.perceivedLatency = this.firstSuggestionShowTime - vsCodeState.lastUserModificationTime
        }
    }

    reset() {
        this.sessionId = ''
        this.requestContext = { request: {} as any, supplementalMetadata: {} as any }
        this.requestIdList = []
        this.startPos = new Position(0, 0)
        this.startCursorOffset = 0
        this.leftContextOfCurrentLine = ''
        this.language = 'python'
        this.triggerType = 'OnDemand'
        this.recommendations = []
        this.suggestionStates.clear()
        this.completionTypes.clear()
        this.diagnosticsBeforeAccept = undefined
    }
}

// TODO: convert this to a function call
export const session = CodeWhispererSession.instance
