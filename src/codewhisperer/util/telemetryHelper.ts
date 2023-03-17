/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import globals from '../../shared/extensionGlobals'

import { runtimeLanguageContext } from './runtimeLanguageContext'
import { RecommendationsList } from '../client/codewhisperer'
import { LicenseUtil } from './licenseUtil'
import { CodewhispererUserDecision, telemetry } from '../../shared/telemetry/telemetry'
import {
    CodewhispererAutomatedTriggerType,
    CodewhispererCompletionType,
    CodewhispererSuggestionState,
    CodewhispererTriggerType,
} from '../../shared/telemetry/telemetry'
import { getImportCount } from './importAdderUtil'

export class TelemetryHelper {
    /**
     * Trigger type for getting CodeWhisperer recommendation
     */
    public triggerType: CodewhispererTriggerType
    /**
     * Auto Trigger Type for getting event of Automated Trigger
     */
    public CodeWhispererAutomatedtriggerType: CodewhispererAutomatedTriggerType
    /**
     * completion Type of the CodeWhisperer recommendation, line vs block
     */
    public completionType: CodewhispererCompletionType
    /**
     * the cursor offset location at invocation time
     */
    public cursorOffset: number

    public startUrl: string | undefined

    public decisionQueue: UserDecisionQueue = new UserDecisionQueue(5)

    // variables for client component latency
    private invokeSuggestionStartTime = 0
    private fetchCredentialStartTime = 0
    private sdkApiCallStartTime = 0
    private sdkApiCallEndTime = 0
    private firstSuggestionShowTime = 0
    private allPaginationEndTime = 0
    private firstResponseRequestId = ''
    private sessionId = ''

    constructor() {
        this.triggerType = 'OnDemand'
        this.CodeWhispererAutomatedtriggerType = 'KeyStrokeCount'
        this.completionType = 'Line'
        this.cursorOffset = 0
        this.startUrl = ''
        this.sessionId = ''
    }

    static #instance: TelemetryHelper

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public recordUserDecisionTelemetryForEmptyList(
        requestId: string,
        sessionId: string,
        paginationIndex: number,
        languageId: string
    ) {
        const languageContext = runtimeLanguageContext.getLanguageContext(languageId)
        telemetry.codewhisperer_userDecision.emit({
            codewhispererRequestId: requestId,
            codewhispererSessionId: sessionId ? sessionId : undefined,
            codewhispererPaginationProgress: paginationIndex,
            codewhispererTriggerType: this.triggerType,
            codewhispererSuggestionIndex: -1,
            codewhispererSuggestionState: 'Empty',
            codewhispererSuggestionReferences: undefined,
            codewhispererSuggestionReferenceCount: 0,
            codewhispererCompletionType: this.completionType,
            codewhispererLanguage: languageContext.language,
            credentialStartUrl: TelemetryHelper.instance.startUrl,
        })
    }

    /**
     * This function is to record the user decision on each of the suggestion in the list of CodeWhisperer recommendations.
     * @param recommendations the recommendations
     * @param acceptIndex the index of the accepted suggestion in the corresponding list of CodeWhisperer response.
     * If this function is not called on acceptance, then acceptIndex == -1
     * @param languageId the language ID of the current document in current active editor
     * @param paginationIndex the index of pagination calls
     * @param recommendationSuggestionState the key-value mapping from index to suggestion state
     */

    public recordUserDecisionTelemetry(
        requestId: string,
        sessionId: string,
        recommendations: RecommendationsList,
        acceptIndex: number,
        languageId: string | undefined,
        paginationIndex: number,
        recommendationSuggestionState?: Map<number, string>
    ) {
        const languageContext = runtimeLanguageContext.getLanguageContext(languageId)
        // emit user decision telemetry
        recommendations.forEach((_elem, i) => {
            let uniqueSuggestionReferences: string | undefined = undefined
            const uniqueLicenseSet = LicenseUtil.getUniqueLicenseNames(_elem.references)
            if (uniqueLicenseSet.size > 0) {
                uniqueSuggestionReferences = JSON.stringify(Array.from(uniqueLicenseSet))
            }
            if (_elem.content.length === 0) {
                recommendationSuggestionState?.set(i, 'Empty')
            }
            const event = {
                codewhispererRequestId: requestId,
                codewhispererSessionId: sessionId ? sessionId : undefined,
                codewhispererPaginationProgress: paginationIndex,
                codewhispererTriggerType: this.triggerType,
                codewhispererSuggestionIndex: i,
                codewhispererSuggestionState: this.getSuggestionState(i, acceptIndex, recommendationSuggestionState),
                codewhispererSuggestionReferences: uniqueSuggestionReferences,
                codewhispererSuggestionReferenceCount: _elem.references ? _elem.references.length : 0,
                codewhispererSuggestionImportCount: getImportCount(_elem),
                codewhispererCompletionType: this.completionType,
                codewhispererLanguage: languageContext.language,
                credentialStartUrl: TelemetryHelper.instance.startUrl,
            }
            telemetry.codewhisperer_userDecision.emit(event)
            if (
                this.decisionQueue.lastDecisionTime &&
                Date.now() - this.decisionQueue.lastDecisionTime > 2 * 60 * 1000
            ) {
                this.decisionQueue.clear()
            }
            this.decisionQueue.push(event, i === recommendations.length - 1)
        })
    }

    public getSuggestionState(
        i: number,
        acceptIndex: number,
        recommendationSuggestionState?: Map<number, string>
    ): CodewhispererSuggestionState {
        const state = recommendationSuggestionState?.get(i)
        if (state && ['Empty', 'Filter', 'Discard'].includes(state)) {
            return state as CodewhispererSuggestionState
        } else if (recommendationSuggestionState !== undefined && recommendationSuggestionState.get(i) !== 'Showed') {
            return 'Unseen'
        }
        if (acceptIndex === -1) {
            return 'Reject'
        }
        return i === acceptIndex ? 'Accept' : 'Ignore'
    }

    public isTelemetryEnabled(): boolean {
        return globals.telemetry.telemetryEnabled
    }

    public resetClientComponentLatencyTime() {
        this.invokeSuggestionStartTime = 0
        this.sdkApiCallStartTime = 0
        this.sdkApiCallEndTime = 0
        this.fetchCredentialStartTime = 0
        this.firstSuggestionShowTime = 0
        this.allPaginationEndTime = 0
        this.firstResponseRequestId = ''
        this.sessionId = ''
    }

    /** This method is assumed to be invoked first at the start of execution **/
    public setInvokeSuggestionStartTime() {
        this.resetClientComponentLatencyTime()
        this.invokeSuggestionStartTime = performance.now()
    }

    public setFetchCredentialStartTime() {
        if (this.fetchCredentialStartTime === 0 && this.invokeSuggestionStartTime !== 0) {
            this.fetchCredentialStartTime = performance.now()
        }
    }

    public setSdkApiCallStartTime() {
        if (this.sdkApiCallStartTime === 0 && this.fetchCredentialStartTime !== 0) {
            this.sdkApiCallStartTime = performance.now()
        }
    }

    public setSdkApiCallEndTime() {
        if (this.sdkApiCallEndTime === 0 && this.sdkApiCallStartTime !== 0) {
            this.sdkApiCallEndTime = performance.now()
        }
    }

    public setAllPaginationEndTime() {
        if (this.allPaginationEndTime === 0 && this.sdkApiCallEndTime !== 0) {
            this.allPaginationEndTime = performance.now()
        }
    }

    public setFirstSuggestionShowTime() {
        if (this.firstSuggestionShowTime === 0 && this.sdkApiCallEndTime !== 0) {
            this.firstSuggestionShowTime = performance.now()
        }
    }

    public setFirstResponseRequestId(requestId: string) {
        if (this.firstResponseRequestId === '') {
            this.firstResponseRequestId = requestId
        }
    }

    public setSessionId(sessionId: string) {
        this.sessionId = sessionId
    }

    // report client component latency after all pagination call finish
    // and at least one suggestion is shown to the user
    public tryRecordClientComponentLatency(languageId: string) {
        if (this.firstSuggestionShowTime === 0 || this.allPaginationEndTime === 0) {
            return
        }
        telemetry.codewhisperer_clientComponentLatency.emit({
            codewhispererRequestId: this.firstResponseRequestId,
            codewhispererSessionId: this.sessionId,
            codewhispererFirstCompletionLatency: this.sdkApiCallEndTime - this.sdkApiCallStartTime,
            codewhispererEndToEndLatency: this.firstSuggestionShowTime - this.invokeSuggestionStartTime,
            codewhispererAllCompletionsLatency: this.allPaginationEndTime - this.sdkApiCallStartTime,
            codewhispererPostprocessingLatency: this.firstSuggestionShowTime - this.sdkApiCallEndTime,
            codewhispererCredentialFetchingLatency: this.sdkApiCallStartTime - this.fetchCredentialStartTime,
            codewhispererPreprocessingLatency: this.fetchCredentialStartTime - this.invokeSuggestionStartTime,
            codewhispererCompletionType: this.completionType,
            codewhispererTriggerType: this.triggerType,
            codewhispererLanguage: runtimeLanguageContext.getLanguageContext(languageId).language,
            credentialStartUrl: this.startUrl,
        })
        this.resetClientComponentLatencyTime()
    }
}

class UserDecisionQueue {
    public readonly size: number

    private buffer: Map<string, CodewhispererSuggestionState[]> = new Map()
    private previousN: CodewhispererSuggestionState[] = []
    public lastDecisionTime?: number

    constructor(size: number) {
        this.size = size
    }

    push(event: CodewhispererUserDecision, isLast: boolean = false) {
        const sessionId = event.codewhispererSessionId
        const decision = event.codewhispererSuggestionState
        if (!sessionId) {
            return
        }

        if (this.buffer.has(sessionId)) {
            this.buffer.get(sessionId)?.push(decision)
        } else {
            this.buffer.set(sessionId, [decision])
        }
        this.lastDecisionTime = Date.now()
        if (isLast) {
            this.flush()
        }
    }

    clear() {
        this.buffer = new Map()
        this.previousN = []
    }

    flush() {
        // assert size is strict equal to 1
        if (this.buffer.size !== 1) {
            console.error('size is not correct')
            return
        }
        let prevSessionId

        for (const [sessionId, decisions] of this.buffer) {
            prevSessionId = sessionId
            this.previousN.push(this.aggregate(decisions))
            if (this.previousN.length > this.size) {
                this.previousN = this.previousN.splice(1)
            }
        }
        if (prevSessionId) {
            this.buffer.delete(prevSessionId)
        }
    }

    mostRecentDecision(): CodewhispererSuggestionState | undefined {
        return this.previousN[this.previousN.length - 1]
    }

    topNDecision(): CodewhispererSuggestionState[] {
        return this.previousN
    }

    // aggregate recommendation level suggestion state to trigger level suggestion state
    private aggregate(decisions: CodewhispererSuggestionState[]): CodewhispererSuggestionState {
        let isEmpty = true
        for (let i = 0; i < decisions.length; i++) {
            const decision = decisions[i]
            if (decision === 'Accept') {
                return 'Accept'
            } else if (decision === 'Reject') {
                return 'Reject'
            } else if (decision !== 'Empty') {
                isEmpty = false
            }
        }

        return isEmpty ? 'Empty' : 'Discard'
    }
}
