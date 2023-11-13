/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    CodewhispererCompletionType,
    CodewhispererLanguage,
    CodewhispererGettingStartedTask,
    CodewhispererTriggerType,
    CodewhispererAutomatedTriggerType,
} from '../../shared/telemetry/telemetry.gen'
import { GenerateRecommendationsRequest, ListRecommendationsRequest, Recommendation } from '../client/codewhisperer'
import { Position } from 'vscode'
import { CodeWhispererSupplementalContext } from './supplementalContext/supplementalContextUtil'

const performance = globalThis.performance ?? require('perf_hooks').performance

export class CodeWhispererSession {
    acceptedIndex: number = -1

    isJobDone: boolean = false
    nextToken: string = ''

    // Per-session states
    sessionId = ''
    requestIdList: string[] = []
    startPos = new Position(0, 0)
    leftContextOfCurrentLine = ''
    requestContext: {
        request: ListRecommendationsRequest | GenerateRecommendationsRequest
        supplementalMetadata: Omit<CodeWhispererSupplementalContext, 'supplementalContextItems'> | undefined
    } = { request: {} as any, supplementalMetadata: {} as any }

    taskType: CodewhispererGettingStartedTask | undefined
    // Various states of recommendations
    recommendations: Recommendation[] = []
    suggestionStates = new Map<number, string>()
    completionTypes = new Map<number, CodewhispererCompletionType>()

    // Some other variables for client component latency
    fetchCredentialStartTime = 0
    sdkApiCallStartTime = 0
    invokeSuggestionStartTime = 0

    constructor(
        readonly language: CodewhispererLanguage,
        readonly triggerType: CodewhispererTriggerType,
        readonly autoTriggerType?: CodewhispererAutomatedTriggerType
    ) {}

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

    setSuggestionState(index: number, value: string) {
        this.suggestionStates.set(index, value)
    }

    getSuggestionState(index: number): string | undefined {
        return this.suggestionStates.get(index)
    }

    setCompletionType(index: number, recommendation: Recommendation) {
        const nonBlankLines = recommendation.content.split('\n').filter(line => line.trim() !== '').length
        this.completionTypes.set(index, nonBlankLines > 1 ? 'Block' : 'Line')
    }

    getCompletionType(index: number): CodewhispererCompletionType {
        return this.completionTypes.get(index) || 'Line'
    }

    hasNextToken(): boolean {
        return this.nextToken !== ''
    }
}
