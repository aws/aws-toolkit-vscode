/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import globals from '../../shared/extensionGlobals'

import { runtimeLanguageContext } from './runtimeLanguageContext'
import { RecommendationsList } from '../client/codewhisperer'
import { LicenseUtil } from './licenseUtil'
import {
    CodewhispererLanguage,
    CodewhispererPreviousSuggestionState,
    CodewhispererServiceInvocation,
    CodewhispererUserDecision,
    CodewhispererUserTriggerDecision,
    telemetry,
} from '../../shared/telemetry/telemetry'
import {
    CodewhispererAutomatedTriggerType,
    CodewhispererCompletionType,
    CodewhispererSuggestionState,
    CodewhispererTriggerType,
} from '../../shared/telemetry/telemetry'
import { getImportCount } from './importAdderUtil'
import { CodeWhispererSettings } from './codewhispererSettings'
import { CodeWhispererUserGroupSettings } from './userGroupUtil'
import { CodeWhispererSupplementalContext } from './supplementalContext/supplementalContextUtil'

const performance = globalThis.performance ?? require('perf_hooks').performance

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

    // variables for client component latency
    private invokeSuggestionStartTime = 0
    private fetchCredentialStartTime = 0
    private sdkApiCallStartTime = 0
    private sdkApiCallEndTime = 0
    private firstSuggestionShowTime = 0
    private allPaginationEndTime = 0
    private firstResponseRequestId = ''
    private sessionId = ''
    // variables for user trigger decision
    // these will be cleared after a invocation session
    private sessionDecisions: CodewhispererUserTriggerDecision[] = []
    public sessionInvocations: CodewhispererServiceInvocation[] = []
    private triggerChar?: string = undefined
    private prevTriggerDecision?: CodewhispererPreviousSuggestionState
    private isRequestCancelled = false
    private lastRequestId = ''
    private numberOfRequests = 0
    private typeAheadLength = 0
    private timeSinceLastModification = 0
    private lastTriggerDecisionTime = 0
    private invocationTime = 0
    private timeToFirstRecommendation = 0
    private classifierResult?: number = undefined
    private classifierThreshold?: number = undefined

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

    public recordServiceInvocationTelemetry(
        requestId: string,
        sessionId: string,
        lastSuggestionIndex: number,
        triggerType: CodewhispererTriggerType,
        autoTriggerType: CodewhispererAutomatedTriggerType | undefined,
        result: 'Succeeded' | 'Failed',
        duration: number | undefined,
        lineNumber: number | undefined,
        language: CodewhispererLanguage,
        reason: string,
        supplementalContextMetadata?: Omit<CodeWhispererSupplementalContext, 'supplementalContextItems'> | undefined
    ) {
        const event = {
            codewhispererRequestId: requestId ? requestId : undefined,
            codewhispererSessionId: sessionId ? sessionId : undefined,
            codewhispererLastSuggestionIndex: lastSuggestionIndex,
            codewhispererTriggerType: triggerType,
            codewhispererAutomatedTriggerType: autoTriggerType,
            codewhispererCompletionType: result === 'Succeeded' ? this.completionType : undefined,
            result,
            duration: duration || 0,
            codewhispererLineNumber: lineNumber || 0,
            codewhispererCursorOffset: this.cursorOffset || 0,
            codewhispererLanguage: language,
            reason: reason ? reason.substring(0, 200) : undefined,
            credentialStartUrl: this.startUrl,
            codewhispererImportRecommendationEnabled: CodeWhispererSettings.instance.isImportRecommendationEnabled(),
            codewhispererSupplementalContextTimeout: supplementalContextMetadata?.isProcessTimeout,
            codewhispererSupplementalContextIsUtg: supplementalContextMetadata?.isUtg,
            codewhispererSupplementalContextLatency: supplementalContextMetadata?.latency,
            codewhispererSupplementalContextLength: supplementalContextMetadata?.contentsLength,
            codewhispererUserGroup: CodeWhispererUserGroupSettings.getUserGroup().toString(),
        }
        telemetry.codewhisperer_serviceInvocation.emit(event)
        this.sessionInvocations.push(event)
    }

    public recordUserDecisionTelemetryForEmptyList(
        requestId: string,
        sessionId: string,
        paginationIndex: number,
        languageId: string,
        supplementalContextMetadata?: Omit<CodeWhispererSupplementalContext, 'supplementalContextItems'> | undefined
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
            codewhispererUserGroup: CodeWhispererUserGroupSettings.getUserGroup().toString(),
            codewhispererSupplementalContextTimeout: supplementalContextMetadata?.isProcessTimeout,
            codewhispererSupplementalContextIsUtg: supplementalContextMetadata?.isUtg,
            codewhispererSupplementalContextLength: supplementalContextMetadata?.contentsLength,
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
        recommendationSuggestionState?: Map<number, string>,
        supplementalContextMetadata?: Omit<CodeWhispererSupplementalContext, 'supplementalContextItems'> | undefined
    ) {
        const languageContext = runtimeLanguageContext.getLanguageContext(languageId)
        const events: CodewhispererUserDecision[] = []
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
            const event: CodewhispererUserDecision = {
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
                codewhispererUserGroup: CodeWhispererUserGroupSettings.getUserGroup().toString(),
                codewhispererSupplementalContextTimeout: supplementalContextMetadata?.isProcessTimeout,
                codewhispererSupplementalContextIsUtg: supplementalContextMetadata?.isUtg,
                codewhispererSupplementalContextLength: supplementalContextMetadata?.contentsLength,
            }
            telemetry.codewhisperer_userDecision.emit(event)
            events.push(event)
        })
        // aggregate user decision events at requestId level
        const aggregatedEvent = this.aggregateUserDecisionByRequest(events, requestId, sessionId)
        if (aggregatedEvent) {
            this.sessionDecisions.push(aggregatedEvent)
        }

        // after we have all request level user decisions, aggregate them at session level and send
        if (
            this.isRequestCancelled ||
            (this.lastRequestId && this.lastRequestId === requestId) ||
            (this.sessionDecisions.length && this.sessionDecisions.length === this.numberOfRequests)
        ) {
            this.sendUserTriggerDecisionTelemetry(sessionId, supplementalContextMetadata)
        }
    }

    private aggregateUserDecisionByRequest(
        events: CodewhispererUserDecision[],
        requestId: string,
        sessionId: string,
        supplementalContextMetadata?: Omit<CodeWhispererSupplementalContext, 'contents'> | undefined
    ) {
        // the request level user decision will contain information from both the service_invocation event
        // and the user_decision events for recommendations within that request
        const serviceInvocation = this.sessionInvocations.find(e => e.codewhispererRequestId === requestId)
        if (!serviceInvocation || !events.length) {
            return
        }
        const aggregated: CodewhispererUserTriggerDecision = {
            codewhispererSessionId: sessionId,
            codewhispererFirstRequestId: this.sessionInvocations[0].codewhispererRequestId ?? requestId,
            credentialStartUrl: events[0].credentialStartUrl,
            codewhispererCompletionType: this.getAggregatedCompletionType(events),
            codewhispererLanguage: events[0].codewhispererLanguage,
            codewhispererTriggerType: events[0].codewhispererTriggerType,
            codewhispererSuggestionCount: events.length,
            codewhispererAutomatedTriggerType: serviceInvocation.codewhispererAutomatedTriggerType,
            codewhispererLineNumber: serviceInvocation.codewhispererLineNumber,
            codewhispererCursorOffset: serviceInvocation.codewhispererCursorOffset,
            codewhispererSuggestionState: this.getAggregatedUserDecision(events),
            codewhispererSuggestionImportCount: events
                .map(e => e.codewhispererSuggestionImportCount || 0)
                .reduce((a, b) => a + b, 0),
            codewhispererTypeaheadLength: 0,
            codewhispererUserGroup: CodeWhispererUserGroupSettings.getUserGroup().toString(),
            codewhispererSupplementalContextTimeout: supplementalContextMetadata?.isProcessTimeout,
            codewhispererSupplementalContextIsUtg: supplementalContextMetadata?.isUtg,
            codewhispererSupplementalContextLength: supplementalContextMetadata?.contentsLength,
        }
        return aggregated
    }

    private sendUserTriggerDecisionTelemetry(
        sessionId: string,
        supplementalContextMetadata?: Omit<CodeWhispererSupplementalContext, 'supplementalContextItems'> | undefined
    ) {
        // the user trigger decision will aggregate information from request level user decisions within one session
        // and add additional session level insights
        if (!this.sessionDecisions.length) {
            return
        }

        // TODO: add partial acceptance related metrics
        const autoTriggerType = this.sessionDecisions[0].codewhispererAutomatedTriggerType
        const language = this.sessionDecisions[0].codewhispererLanguage
        const aggregated: CodewhispererUserTriggerDecision = {
            codewhispererSessionId: sessionId,
            codewhispererFirstRequestId: this.sessionDecisions[0].codewhispererFirstRequestId,
            credentialStartUrl: this.sessionDecisions[0].credentialStartUrl,
            codewhispererCompletionType: this.getAggregatedCompletionType(this.sessionDecisions),
            codewhispererLanguage: language,
            codewhispererTriggerType: this.sessionDecisions[0].codewhispererTriggerType,
            codewhispererSuggestionCount: this.sessionDecisions
                .map(e => e.codewhispererSuggestionCount)
                .reduce((a, b) => a + b, 0),
            codewhispererAutomatedTriggerType: autoTriggerType,
            codewhispererLineNumber: this.sessionDecisions[0].codewhispererLineNumber,
            codewhispererCursorOffset: this.sessionDecisions[0].codewhispererCursorOffset,
            codewhispererSuggestionImportCount: this.sessionDecisions
                .map(e => e.codewhispererSuggestionImportCount || 0)
                .reduce((a, b) => a + b, 0),
            codewhispererTypeaheadLength: this.typeAheadLength,
            codewhispererTimeSinceLastDocumentChange: this.timeSinceLastModification
                ? this.timeSinceLastModification
                : undefined,
            codewhispererTimeSinceLastUserDecision: this.lastTriggerDecisionTime
                ? performance.now() - this.lastTriggerDecisionTime
                : undefined,
            codewhispererTimeToFirstRecommendation: this.timeToFirstRecommendation,
            codewhispererTriggerCharacter: autoTriggerType === 'SpecialCharacters' ? this.triggerChar : undefined,
            codewhispererSuggestionState: this.getAggregatedUserDecision(this.sessionDecisions),
            codewhispererPreviousSuggestionState: this.prevTriggerDecision,
            codewhispererClassifierResult: this.classifierResult,
            codewhispererClassifierThreshold: this.classifierThreshold,
            codewhispererUserGroup: CodeWhispererUserGroupSettings.getUserGroup().toString(),
            codewhispererSupplementalContextTimeout: supplementalContextMetadata?.isProcessTimeout,
            codewhispererSupplementalContextIsUtg: supplementalContextMetadata?.isUtg,
            codewhispererSupplementalContextLength: supplementalContextMetadata?.contentsLength,
        }
        telemetry.codewhisperer_userTriggerDecision.emit(aggregated)
        this.prevTriggerDecision = this.getAggregatedUserDecision(this.sessionDecisions)
        this.lastTriggerDecisionTime = performance.now()
        this.resetUserTriggerDecisionTelemetry()
    }

    public getLastTriggerDecisionForClassifier() {
        if (this.lastTriggerDecisionTime && Date.now() - this.lastTriggerDecisionTime <= 2 * 60 * 1000) {
            return this.prevTriggerDecision
        }
    }

    public setClassifierResult(classifierResult: number) {
        this.classifierResult = classifierResult
    }

    public setClassifierThreshold(classifierThreshold: number) {
        this.classifierThreshold = classifierThreshold
    }

    public setIsRequestCancelled(isRequestCancelled: boolean) {
        this.isRequestCancelled = isRequestCancelled
    }

    public setTriggerCharForUserTriggerDecision(triggerChar: string) {
        this.triggerChar = triggerChar
    }

    public setLastRequestId(requestId: string) {
        this.lastRequestId = requestId
    }

    public setNumberOfRequestsInSession(numberOfRequests: number) {
        this.numberOfRequests = numberOfRequests
    }

    public setTypeAheadLength(typeAheadLength: number) {
        this.typeAheadLength = typeAheadLength
    }

    public setTimeSinceLastModification(timeSinceLastModification: number) {
        this.timeSinceLastModification = timeSinceLastModification
    }

    public setInvocationStartTime(invocationTime: number) {
        this.invocationTime = invocationTime
    }

    public setTimeToFirstRecommendation(timeToFirstRecommendation: number) {
        if (this.invocationTime) {
            this.timeToFirstRecommendation = timeToFirstRecommendation - this.invocationTime
        }
    }

    private resetUserTriggerDecisionTelemetry() {
        this.sessionDecisions = []
        this.isRequestCancelled = false
        this.sessionInvocations = []
        this.triggerChar = ''
        this.lastRequestId = ''
        this.numberOfRequests = 0
        this.typeAheadLength = 0
        this.timeSinceLastModification = 0
        this.timeToFirstRecommendation = 0
        this.classifierResult = undefined
        this.classifierThreshold = undefined
    }

    private getAggregatedCompletionType(
        // if there is any Block completion within the session, mark the session as Block completion
        events: CodewhispererUserDecision[] | CodewhispererUserTriggerDecision[]
    ): CodewhispererCompletionType {
        return events.some(e => e.codewhispererCompletionType === 'Block') ? 'Block' : 'Line'
    }

    private getAggregatedUserDecision(
        // if there is any Accept within the session, mark the session as Accept
        // if there is any Reject within the session, mark the session as Reject
        // if all recommendations within the session are empty, mark the session as Empty
        // otherwise mark the session as Discard
        events: CodewhispererUserDecision[] | CodewhispererUserTriggerDecision[]
    ): CodewhispererPreviousSuggestionState {
        let isEmpty = true
        for (const event of events) {
            if (event.codewhispererSuggestionState === 'Accept') {
                return 'Accept'
            } else if (event.codewhispererSuggestionState === 'Reject') {
                return 'Reject'
            } else if (event.codewhispererSuggestionState !== 'Empty') {
                isEmpty = false
            }
        }
        return isEmpty ? 'Empty' : 'Discard'
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
            codewhispererUserGroup: CodeWhispererUserGroupSettings.getUserGroup().toString(),
        })
        this.resetClientComponentLatencyTime()
    }
}
