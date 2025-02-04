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

export class CodeWhispererSessionState {
    static #instance: CodeWhispererSessionState
    session: CodeWhispererSession
    nextSession: CodeWhispererSession

    constructor() {
        this.session = new CodeWhispererSession()
        this.nextSession = new CodeWhispererSession()
    }
    public static get instance() {
        return (this.#instance ??= new CodeWhispererSessionState())
    }

    getSession() {
        return this.session
    }

    setSession(session: CodeWhispererSession) {
        this.session = session
    }

    getNextSession() {
        return this.nextSession
    }

    setNextSession(session: CodeWhispererSession) {
        this.nextSession = session
    }
}

export class CodeWhispererSession {
    sessionId: string = ''
    requestIdList: string[] = []
    startPos: Position = new Position(0, 0)
    startCursorOffset: number = 0
    leftContextOfCurrentLine: string = ''
    requestContext: {
        request: ListRecommendationsRequest | GenerateRecommendationsRequest
        supplementalMetadata: CodeWhispererSupplementalContext | undefined
    } = { request: {} as any, supplementalMetadata: undefined }
    language: CodewhispererLanguage = 'python'
    taskType: CodewhispererGettingStartedTask | undefined = undefined
    triggerType: CodewhispererTriggerType = 'OnDemand'
    autoTriggerType: CodewhispererAutomatedTriggerType | undefined = undefined
    // Various states of recommendations
    recommendations: Recommendation[] = []
    suggestionStates: Map<number, string> = new Map<number, string>()
    completionTypes: Map<number, CodewhispererCompletionType> = new Map<number, CodewhispererCompletionType>()
    // Some other variables for client component latency
    fetchCredentialStartTime: number = 0
    sdkApiCallStartTime: number = 0
    invokeSuggestionStartTime: number = 0
    preprocessEndTime: number = 0
    timeToFirstRecommendation: number = 0
    firstSuggestionShowTime: number = 0
    perceivedLatency: number = 0

    // Per-session states
    constructor() {}

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
            return this.firstSuggestionShowTime - vsCodeState.lastUserModificationTime
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
    }
}
