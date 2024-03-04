/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import globals from '../../shared/extensionGlobals'

import { runtimeLanguageContext } from './runtimeLanguageContext'
import { codeWhispererClient as client, RecommendationsList } from '../client/codewhisperer'
import { LicenseUtil } from './licenseUtil'
import {
    CodewhispererGettingStartedTask,
    CodewhispererLanguage,
    CodewhispererPreviousSuggestionState,
    CodewhispererUserDecision,
    CodewhispererUserTriggerDecision,
    telemetry,
} from '../../shared/telemetry/telemetry'
import { CodewhispererCompletionType, CodewhispererSuggestionState } from '../../shared/telemetry/telemetry'
import { getImportCount } from './importAdderUtil'
import { CodeWhispererSettings } from './codewhispererSettings'
import { CodeWhispererUserGroupSettings } from './userGroupUtil'
import { getSelectedCustomization } from './customizationUtil'
import { AuthUtil } from './authUtil'
import { isAwsError } from '../../shared/errors'
import { getLogger } from '../../shared/logger'
import { session } from './codeWhispererSession'
import { CodeWhispererSupplementalContext } from '../models/model'
import { FeatureConfigProvider } from '../service/featureConfigProvider'

const performance = globalThis.performance ?? require('perf_hooks').performance

export class TelemetryHelper {
    // Some variables for client component latency
    private sdkApiCallEndTime = 0
    private firstSuggestionShowTime = 0
    private allPaginationEndTime = 0
    private firstResponseRequestId = ''
    // variables for user trigger decision
    // these will be cleared after a invocation session
    private sessionDecisions: CodewhispererUserTriggerDecision[] = []
    private triggerChar?: string = undefined
    private prevTriggerDecision?: CodewhispererPreviousSuggestionState
    private typeAheadLength = 0
    private timeSinceLastModification = 0
    private lastTriggerDecisionTime = 0
    private invocationTime = 0
    private timeToFirstRecommendation = 0
    private classifierResult?: number = undefined
    private classifierThreshold?: number = undefined

    // use this to distinguish DocumentChangeEvent from CWSPR or from other sources
    public lastSuggestionInDisplay = ''

    constructor() {}

    static #instance: TelemetryHelper

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public recordServiceInvocationTelemetry(
        requestId: string,
        sessionId: string,
        lastSuggestionIndex: number,
        result: 'Succeeded' | 'Failed',
        duration: number | undefined,
        language: CodewhispererLanguage,
        taskType: CodewhispererGettingStartedTask | undefined,
        reason: string,
        supplementalContextMetadata?: CodeWhispererSupplementalContext | undefined
    ) {
        const event = {
            codewhispererRequestId: requestId ? requestId : undefined,
            codewhispererSessionId: sessionId ? sessionId : undefined,
            codewhispererLastSuggestionIndex: lastSuggestionIndex,
            codewhispererTriggerType: session.triggerType,
            codewhispererAutomatedTriggerType: session.autoTriggerType,
            result,
            duration: duration || 0,
            codewhispererLineNumber: session.startPos.line,
            codewhispererCursorOffset: session.startCursorOffset,
            codewhispererLanguage: language,
            CodewhispererGettingStartedTask: taskType,
            reason: reason ? reason.substring(0, 200) : undefined,
            credentialStartUrl: AuthUtil.instance.startUrl,
            codewhispererImportRecommendationEnabled: CodeWhispererSettings.instance.isImportRecommendationEnabled(),
            codewhispererSupplementalContextTimeout: supplementalContextMetadata?.isProcessTimeout,
            codewhispererSupplementalContextIsUtg: supplementalContextMetadata?.isUtg,
            codewhispererSupplementalContextLatency: supplementalContextMetadata?.latency,
            codewhispererSupplementalContextLength: supplementalContextMetadata?.contentsLength,
            codewhispererUserGroup: CodeWhispererUserGroupSettings.getUserGroup().toString(),
            codewhispererCustomizationArn: getSelectedCustomization().arn,
        }
        telemetry.codewhisperer_serviceInvocation.emit(event)
    }

    public recordUserDecisionTelemetryForEmptyList(
        requestIdList: string[],
        sessionId: string,
        paginationIndex: number,
        language: CodewhispererLanguage,
        supplementalContextMetadata?: CodeWhispererSupplementalContext | undefined
    ) {
        telemetry.codewhisperer_userDecision.emit({
            codewhispererRequestId: requestIdList[0],
            codewhispererSessionId: sessionId ? sessionId : undefined,
            codewhispererPaginationProgress: paginationIndex,
            codewhispererTriggerType: session.triggerType,
            codewhispererSuggestionIndex: -1,
            codewhispererSuggestionState: 'Empty',
            codewhispererSuggestionReferences: undefined,
            codewhispererSuggestionReferenceCount: 0,
            codewhispererCompletionType: 'Line',
            codewhispererLanguage: language,
            codewhispererGettingStartedTask: session.taskType,
            credentialStartUrl: AuthUtil.instance.startUrl,
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
        requestIdList: string[],
        sessionId: string,
        recommendations: RecommendationsList,
        acceptIndex: number,
        paginationIndex: number,
        completionTypes: Map<number, CodewhispererCompletionType>,
        recommendationSuggestionState?: Map<number, string>,
        supplementalContextMetadata?: CodeWhispererSupplementalContext | undefined
    ) {
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
                // TODO: maintain a list of RecommendationContexts with both recommendation and requestId in it, instead of two separate list items.
                codewhispererRequestId: requestIdList[i],
                codewhispererSessionId: sessionId ? sessionId : undefined,
                codewhispererPaginationProgress: paginationIndex,
                codewhispererTriggerType: session.triggerType,
                codewhispererSuggestionIndex: i,
                codewhispererSuggestionState: this.getSuggestionState(i, acceptIndex, recommendationSuggestionState),
                codewhispererSuggestionReferences: uniqueSuggestionReferences,
                codewhispererSuggestionReferenceCount: _elem.references ? _elem.references.length : 0,
                codewhispererSuggestionImportCount: getImportCount(_elem),
                codewhispererCompletionType: this.getCompletionType(i, completionTypes),
                codewhispererLanguage: session.language,
                codewhispererGettingStartedTask: session.taskType,
                credentialStartUrl: AuthUtil.instance.startUrl,
                codewhispererUserGroup: CodeWhispererUserGroupSettings.getUserGroup().toString(),
                codewhispererSupplementalContextTimeout: supplementalContextMetadata?.isProcessTimeout,
                codewhispererSupplementalContextIsUtg: supplementalContextMetadata?.isUtg,
                codewhispererSupplementalContextLength: supplementalContextMetadata?.contentsLength,
            }
            telemetry.codewhisperer_userDecision.emit(event)
            events.push(event)
        })

        //aggregate suggestion references count
        const referenceCount = this.getAggregatedSuggestionReferenceCount(events)

        // aggregate user decision events at requestId level
        const aggregatedEvent = this.aggregateUserDecisionByRequest(events, requestIdList[0], sessionId)
        if (aggregatedEvent) {
            this.sessionDecisions.push(aggregatedEvent)
        }

        // TODO: use a ternary for this
        let acceptedRecommendationContent
        if (acceptIndex !== -1 && recommendations[acceptIndex] !== undefined) {
            acceptedRecommendationContent = recommendations[acceptIndex].content
        } else {
            acceptedRecommendationContent = ''
        }

        // after we have all request level user decisions, aggregate them at session level and send
        this.sendUserTriggerDecisionTelemetry(
            sessionId,
            acceptedRecommendationContent,
            referenceCount,
            supplementalContextMetadata
        )
    }

    public aggregateUserDecisionByRequest(
        events: CodewhispererUserDecision[],
        requestId: string,
        sessionId: string,
        supplementalContextMetadata?: CodeWhispererSupplementalContext | undefined
    ) {
        // the request level user decision will contain information from both the service_invocation event
        // and the user_decision events for recommendations within that request
        if (!events.length) {
            return
        }
        const aggregated: CodewhispererUserTriggerDecision = {
            codewhispererSessionId: sessionId,
            codewhispererFirstRequestId: requestId,
            credentialStartUrl: events[0].credentialStartUrl,
            codewhispererLanguage: events[0].codewhispererLanguage,
            codewhispererGettingStartedTask: session.taskType,
            codewhispererTriggerType: events[0].codewhispererTriggerType,
            codewhispererCompletionType: events[0].codewhispererCompletionType,
            codewhispererSuggestionCount: events.length,
            codewhispererAutomatedTriggerType: session.autoTriggerType,
            codewhispererLineNumber: session.startPos.line,
            codewhispererCursorOffset: session.startCursorOffset,
            codewhispererSuggestionState: this.getAggregatedSuggestionState(events),
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

    public sendUserTriggerDecisionTelemetry(
        sessionId: string,
        acceptedRecommendationContent: string,
        referenceCount: number,
        supplementalContextMetadata?: CodeWhispererSupplementalContext | undefined
    ) {
        // the user trigger decision will aggregate information from request level user decisions within one session
        // and add additional session level insights
        if (!this.sessionDecisions.length) {
            return
        }

        // TODO: add partial acceptance related metrics
        const autoTriggerType = this.sessionDecisions[0].codewhispererAutomatedTriggerType
        const language = this.sessionDecisions[0].codewhispererLanguage
        const aggregatedCompletionType = this.sessionDecisions[0].codewhispererCompletionType
        const aggregatedSuggestionState = this.getAggregatedSuggestionState(this.sessionDecisions)
        const selectedCustomization = getSelectedCustomization()
        const generatedLines =
            acceptedRecommendationContent.trim() === '' ? 0 : acceptedRecommendationContent.split('\n').length
        const suggestionCount = this.sessionDecisions
            .map(e => e.codewhispererSuggestionCount)
            .reduce((a, b) => a + b, 0)

        const aggregated: CodewhispererUserTriggerDecision = {
            codewhispererSessionId: this.sessionDecisions[0].codewhispererSessionId,
            codewhispererFirstRequestId: this.sessionDecisions[0].codewhispererFirstRequestId,
            credentialStartUrl: this.sessionDecisions[0].credentialStartUrl,
            codewhispererCompletionType: aggregatedCompletionType,
            codewhispererLanguage: language,
            codewhispererGettingStartedTask: session.taskType,
            codewhispererTriggerType: this.sessionDecisions[0].codewhispererTriggerType,
            codewhispererSuggestionCount: suggestionCount,
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
            codewhispererSuggestionState: aggregatedSuggestionState,
            codewhispererPreviousSuggestionState: this.prevTriggerDecision,
            codewhispererClassifierResult: this.classifierResult,
            codewhispererClassifierThreshold: this.classifierThreshold,
            codewhispererUserGroup: CodeWhispererUserGroupSettings.getUserGroup().toString(),
            codewhispererSupplementalContextTimeout: supplementalContextMetadata?.isProcessTimeout,
            codewhispererSupplementalContextIsUtg: supplementalContextMetadata?.isUtg,
            codewhispererSupplementalContextLength: supplementalContextMetadata?.contentsLength,
            codewhispererCustomizationArn: selectedCustomization.arn === '' ? undefined : selectedCustomization.arn,
            // eslint-disable-next-line id-length
            codewhispererSupplementalContextStrategyId: supplementalContextMetadata?.strategy,
            codewhispererCharactersAccepted: acceptedRecommendationContent.length,
            codewhispererFeatureEvaluations: FeatureConfigProvider.instance.getFeatureConfigsTelemetry(),
        }
        telemetry.codewhisperer_userTriggerDecision.emit(aggregated)
        this.prevTriggerDecision = this.getAggregatedSuggestionState(this.sessionDecisions)
        this.lastTriggerDecisionTime = performance.now()

        // When we send a userTriggerDecision of Empty or Discard, we set the time users see the first
        // suggestion to be now.
        let e2eLatency = this.firstSuggestionShowTime - session.invokeSuggestionStartTime
        if (e2eLatency < 0) {
            e2eLatency = performance.now() - session.invokeSuggestionStartTime
        }

        client
            .sendTelemetryEvent({
                telemetryEvent: {
                    userTriggerDecisionEvent: {
                        sessionId: sessionId,
                        requestId: this.sessionDecisions[0].codewhispererFirstRequestId,
                        customizationArn: selectedCustomization.arn === '' ? undefined : selectedCustomization.arn,
                        programmingLanguage: {
                            languageName: runtimeLanguageContext.toRuntimeLanguage(
                                this.sessionDecisions[0].codewhispererLanguage
                            ),
                        },
                        completionType: this.getSendTelemetryCompletionType(aggregatedCompletionType),
                        suggestionState: this.getSendTelemetrySuggestionState(aggregatedSuggestionState),
                        recommendationLatencyMilliseconds: e2eLatency,
                        timestamp: new Date(Date.now()),
                        triggerToResponseLatencyMilliseconds: this.timeToFirstRecommendation,
                        suggestionReferenceCount: referenceCount,
                        generatedLine: generatedLines,
                        numberOfRecommendations: suggestionCount,
                    },
                },
            })
            .then()
            .catch(error => {
                let requestId: string | undefined
                if (isAwsError(error)) {
                    requestId = error.requestId
                }

                getLogger().debug(
                    `Failed to sendTelemetryEvent to CodeWhisperer, requestId: ${requestId ?? ''}, message: ${
                        error.message
                    }`
                )
            })
        this.resetUserTriggerDecisionTelemetry()
    }

    public getLastTriggerDecisionForClassifier() {
        if (this.lastTriggerDecisionTime && performance.now() - this.lastTriggerDecisionTime <= 2 * 60 * 1000) {
            return this.prevTriggerDecision
        }
    }

    public setClassifierResult(classifierResult: number) {
        this.classifierResult = classifierResult
    }

    public setClassifierThreshold(classifierThreshold: number) {
        this.classifierThreshold = classifierThreshold
    }

    public setTriggerCharForUserTriggerDecision(triggerChar: string) {
        this.triggerChar = triggerChar
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
        this.triggerChar = ''
        this.typeAheadLength = 0
        this.timeSinceLastModification = 0
        this.timeToFirstRecommendation = 0
        this.classifierResult = undefined
        this.classifierThreshold = undefined
    }

    private getSendTelemetryCompletionType(completionType: CodewhispererCompletionType) {
        return completionType === 'Block' ? 'BLOCK' : 'LINE'
    }

    private getAggregatedSuggestionState(
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

    private getSendTelemetrySuggestionState(state: CodewhispererPreviousSuggestionState) {
        if (state === 'Accept') {
            return 'ACCEPT'
        } else if (state === 'Reject') {
            return 'REJECT'
        } else if (state === 'Discard') {
            return 'DISCARD'
        }
        return 'EMPTY'
    }

    private getAggregatedSuggestionReferenceCount(
        events: CodewhispererUserDecision[]
        // if there is reference for accepted recommendation within the session, mark the reference number
        // as 1, otherwise mark the session as 0
    ) {
        for (const event of events) {
            if (event.codewhispererSuggestionState === 'Accept' && event.codewhispererSuggestionReferenceCount !== 0) {
                return 1
            }
        }
        return 0
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

    public getCompletionType(i: number, completionTypes: Map<number, CodewhispererCompletionType>) {
        return completionTypes.get(i) || 'Line'
    }

    public isTelemetryEnabled(): boolean {
        return globals.telemetry.telemetryEnabled
    }

    public resetClientComponentLatencyTime() {
        session.invokeSuggestionStartTime = 0
        session.sdkApiCallStartTime = 0
        this.sdkApiCallEndTime = 0
        session.fetchCredentialStartTime = 0
        this.firstSuggestionShowTime = 0
        this.allPaginationEndTime = 0
        this.firstResponseRequestId = ''
    }

    /** This method is assumed to be invoked first at the start of execution **/
    public setInvokeSuggestionStartTime() {
        this.resetClientComponentLatencyTime()
        session.invokeSuggestionStartTime = performance.now()
    }

    public setSdkApiCallEndTime() {
        if (this.sdkApiCallEndTime === 0 && session.sdkApiCallStartTime !== 0) {
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

    // report client component latency after all pagination call finish
    // and at least one suggestion is shown to the user
    public tryRecordClientComponentLatency() {
        if (this.firstSuggestionShowTime === 0 || this.allPaginationEndTime === 0) {
            return
        }
        telemetry.codewhisperer_clientComponentLatency.emit({
            codewhispererRequestId: this.firstResponseRequestId,
            codewhispererSessionId: session.sessionId,
            codewhispererFirstCompletionLatency: this.sdkApiCallEndTime - session.sdkApiCallStartTime,
            codewhispererEndToEndLatency: this.firstSuggestionShowTime - session.invokeSuggestionStartTime,
            codewhispererAllCompletionsLatency: this.allPaginationEndTime - session.sdkApiCallStartTime,
            codewhispererPostprocessingLatency: this.firstSuggestionShowTime - this.sdkApiCallEndTime,
            codewhispererCredentialFetchingLatency: session.sdkApiCallStartTime - session.fetchCredentialStartTime,
            codewhispererPreprocessingLatency: session.fetchCredentialStartTime - session.invokeSuggestionStartTime,
            codewhispererCompletionType: 'Line',
            codewhispererTriggerType: session.triggerType,
            codewhispererLanguage: session.language,
            credentialStartUrl: AuthUtil.instance.startUrl,
            codewhispererUserGroup: CodeWhispererUserGroupSettings.getUserGroup().toString(),
        })
    }
    public sendCodeScanEvent(languageId: string, jobId: string) {
        getLogger().debug(`start sendCodeScanEvent: jobId: "${jobId}", languageId: "${languageId}"`)

        let codewhispererRuntimeLanguage: string = languageId
        if (codewhispererRuntimeLanguage === 'jsx') {
            codewhispererRuntimeLanguage = 'javascript'
        } else if (codewhispererRuntimeLanguage === 'tsx') {
            codewhispererRuntimeLanguage = 'typescript'
        }

        client
            .sendTelemetryEvent({
                telemetryEvent: {
                    codeScanEvent: {
                        programmingLanguage: {
                            languageName: runtimeLanguageContext.toRuntimeLanguage(languageId as CodewhispererLanguage),
                        },
                        codeScanJobId: jobId,
                        timestamp: new Date(Date.now()),
                    },
                },
            })
            .then()
            .catch(error => {
                let requestId: string | undefined
                if (isAwsError(error)) {
                    requestId = error.requestId
                }

                getLogger().debug(
                    `Failed to sendCodeScanEvent to CodeWhisperer, requestId: ${requestId ?? ''}, message: ${
                        error.message
                    }`
                )
            })
    }
}
