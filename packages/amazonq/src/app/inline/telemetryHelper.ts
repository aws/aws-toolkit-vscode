/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AuthUtil,
    codeWhispererClient,
    CodeWhispererSettings,
    CodeWhispererSupplementalContext,
    FeatureConfigProvider,
    getImportCount,
    getSelectedCustomization,
    LicenseUtil,
    RecommendationsList,
    runtimeLanguageContext,
    session,
} from 'aws-core-vscode/codewhisperer'
import {
    CodewhispererCompletionType,
    CodewhispererLanguage,
    CodewhispererSuggestionState,
    CodewhispererUserDecision,
    CodewhispererUserTriggerDecision,
    getLogger,
    globals,
    isAwsError,
} from 'aws-core-vscode/shared'
import {
    CodewhispererGettingStartedTask,
    CodewhispererPreviousSuggestionState,
    CodewhispererTriggerType,
    telemetry,
} from 'aws-core-vscode/telemetry'

export class TelemetryHelper {
    // Some variables for client component latency
    private _sdkApiCallEndTime = 0
    get sdkApiCallEndTime(): number {
        return this._sdkApiCallEndTime
    }
    private _allPaginationEndTime = 0
    get allPaginationEndTime(): number {
        return this._allPaginationEndTime
    }
    private _firstResponseRequestId = ''
    get firstResponseRequestId(): string {
        return this._firstResponseRequestId
    }

    // Variables moved from session object
    private _invokeSuggestionStartTime = 0
    get invokeSuggestionStartTime(): number {
        return this._invokeSuggestionStartTime
    }
    private _preprocessEndTime = 0
    get preprocessEndTime(): number {
        return this._preprocessEndTime
    }
    private _sdkApiCallStartTime = 0
    get sdkApiCallStartTime(): number {
        return this._sdkApiCallStartTime
    }
    private _fetchCredentialStartTime = 0
    get fetchCredentialStartTime(): number {
        return this._fetchCredentialStartTime
    }
    private _firstSuggestionShowTime = 0
    get firstSuggestionShowTime(): number {
        return this._firstSuggestionShowTime
    }
    private _timeToFirstRecommendation = 0
    get timeToFirstRecommendation(): number {
        return this._timeToFirstRecommendation
    }
    private _perceivedLatency = 0
    get perceivedLatency(): number {
        return this._perceivedLatency
    }
    private _sessionId = ''
    get sessionId(): string {
        return this._sessionId
    }
    private _language: CodewhispererLanguage = 'java'
    get language(): CodewhispererLanguage {
        return this._language
    }
    private _triggerType: CodewhispererTriggerType = 'OnDemand'
    get triggerType(): string {
        return this._triggerType
    }
    // variables for user trigger decision
    // these will be cleared after a invocation session
    private sessionDecisions: CodewhispererUserTriggerDecision[] = []
    private triggerChar?: string = undefined
    private prevTriggerDecision?: CodewhispererPreviousSuggestionState
    private typeAheadLength = 0
    private timeSinceLastModification = 0
    private lastTriggerDecisionTime = 0
    private classifierResult?: number = undefined
    private classifierThreshold?: number = undefined
    // variables for tracking end to end sessions
    public traceId: string = 'notSet'

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
            codewhispererAutomatedTriggerType: session.autoTriggerType,
            codewhispererCursorOffset: session.startCursorOffset,
            codewhispererCustomizationArn: getSelectedCustomization().arn,
            CodewhispererGettingStartedTask: taskType,
            codewhispererImportRecommendationEnabled: CodeWhispererSettings.instance.isImportRecommendationEnabled(),
            codewhispererLastSuggestionIndex: lastSuggestionIndex,
            codewhispererLanguage: language,
            codewhispererLineNumber: session.startPos.line,
            codewhispererRequestId: requestId ? requestId : undefined,
            codewhispererSessionId: sessionId ? sessionId : undefined,
            codewhispererSupplementalContextIsUtg: supplementalContextMetadata?.isUtg,
            codewhispererSupplementalContextLatency: supplementalContextMetadata?.latency,
            codewhispererSupplementalContextLength: supplementalContextMetadata?.contentsLength,
            codewhispererSupplementalContextTimeout: supplementalContextMetadata?.isProcessTimeout,
            codewhispererTriggerType: session.triggerType,
            credentialStartUrl: AuthUtil.instance.startUrl,
            duration: duration || 0,
            reason: reason ? reason.substring(0, 200) : undefined,
            result,
            traceId: this.traceId,
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
        const selectedCustomization = getSelectedCustomization()
        const profile = AuthUtil.instance.regionProfileManager.activeRegionProfile

        telemetry.codewhisperer_userTriggerDecision.emit({
            codewhispererAutomatedTriggerType: session.autoTriggerType,
            codewhispererClassifierResult: this.classifierResult,
            codewhispererClassifierThreshold: this.classifierThreshold,
            codewhispererCompletionType: 'Line',
            codewhispererCursorOffset: session.startCursorOffset,
            codewhispererCustomizationArn: selectedCustomization.arn === '' ? undefined : selectedCustomization.arn,
            codewhispererFeatureEvaluations: FeatureConfigProvider.instance.getFeatureConfigsTelemetry(),
            codewhispererFirstRequestId: requestIdList[0],
            codewhispererGettingStartedTask: session.taskType,
            codewhispererLanguage: language,
            codewhispererLineNumber: session.startPos.line,
            codewhispererPreviousSuggestionState: this.prevTriggerDecision,
            codewhispererSessionId: sessionId,
            codewhispererSuggestionCount: 0,
            codewhispererSuggestionImportCount: 0,
            codewhispererSuggestionState: 'Empty',
            codewhispererSupplementalContextIsUtg: supplementalContextMetadata?.isUtg,
            codewhispererSupplementalContextLength: supplementalContextMetadata?.contentsLength,
            // eslint-disable-next-line id-length
            codewhispererSupplementalContextStrategyId: supplementalContextMetadata?.strategy,
            codewhispererSupplementalContextTimeout: supplementalContextMetadata?.isProcessTimeout,
            codewhispererTimeSinceLastDocumentChange: this.timeSinceLastModification
                ? this.timeSinceLastModification
                : undefined,
            codewhispererTimeSinceLastUserDecision: this.lastTriggerDecisionTime
                ? performance.now() - this.lastTriggerDecisionTime
                : undefined,
            codewhispererTimeToFirstRecommendation: session.timeToFirstRecommendation,
            codewhispererTriggerType: session.triggerType,
            codewhispererTypeaheadLength: this.typeAheadLength,
            credentialStartUrl: AuthUtil.instance.startUrl,
            traceId: this.traceId,
        })

        codeWhispererClient
            .sendTelemetryEvent({
                telemetryEvent: {
                    userTriggerDecisionEvent: {
                        sessionId: sessionId,
                        requestId: requestIdList[0],
                        customizationArn: selectedCustomization.arn === '' ? undefined : selectedCustomization.arn,
                        programmingLanguage: {
                            languageName: runtimeLanguageContext.toRuntimeLanguage(language),
                        },
                        completionType: 'LINE',
                        suggestionState: 'EMPTY',
                        recommendationLatencyMilliseconds: 0,
                        triggerToResponseLatencyMilliseconds: session.timeToFirstRecommendation,
                        perceivedLatencyMilliseconds: session.perceivedLatency,
                        timestamp: new Date(Date.now()),
                        suggestionReferenceCount: 0,
                        generatedLine: 0,
                        numberOfRecommendations: 0,
                        acceptedCharacterCount: 0,
                    },
                },
                profileArn: profile?.arn,
            })
            .then()
            .catch((error) => {
                let requestId: string | undefined
                if (isAwsError(error)) {
                    requestId = error.requestId
                }

                getLogger().error(`Failed to invoke sendTelemetryEvent, requestId: ${requestId ?? ''}`)
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
        for (const [i, _elem] of recommendations.entries()) {
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
                codewhispererCompletionType: this.getCompletionType(i, completionTypes),
                codewhispererGettingStartedTask: session.taskType,
                codewhispererLanguage: session.language,
                codewhispererPaginationProgress: paginationIndex,
                codewhispererRequestId: requestIdList[i],
                codewhispererSessionId: sessionId ? sessionId : undefined,
                codewhispererSuggestionImportCount: getImportCount(_elem),
                codewhispererSuggestionIndex: i,
                codewhispererSuggestionState: this.getSuggestionState(i, acceptIndex, recommendationSuggestionState),
                codewhispererSuggestionReferenceCount: _elem.references ? _elem.references.length : 0,
                codewhispererSuggestionReferences: uniqueSuggestionReferences,
                codewhispererSupplementalContextIsUtg: supplementalContextMetadata?.isUtg,
                codewhispererSupplementalContextLength: supplementalContextMetadata?.contentsLength,
                codewhispererSupplementalContextTimeout: supplementalContextMetadata?.isProcessTimeout,
                codewhispererTriggerType: session.triggerType,
                credentialStartUrl: AuthUtil.instance.startUrl,
                traceId: this.traceId,
            }
            events.push(event)
        }

        // aggregate suggestion references count
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
            codewhispererAutomatedTriggerType: session.autoTriggerType,
            codewhispererCompletionType: events[0].codewhispererCompletionType,
            codewhispererCursorOffset: session.startCursorOffset,
            codewhispererFirstRequestId: requestId,
            codewhispererGettingStartedTask: session.taskType,
            codewhispererLanguage: events[0].codewhispererLanguage,
            codewhispererLineNumber: session.startPos.line,
            codewhispererSessionId: sessionId,
            codewhispererSuggestionCount: events.length,
            codewhispererSuggestionImportCount: events
                .map((e) => e.codewhispererSuggestionImportCount || 0)
                .reduce((a, b) => a + b, 0),
            codewhispererSuggestionState: this.getAggregatedSuggestionState(events),
            codewhispererSupplementalContextIsUtg: supplementalContextMetadata?.isUtg,
            codewhispererSupplementalContextLength: supplementalContextMetadata?.contentsLength,
            codewhispererSupplementalContextTimeout: supplementalContextMetadata?.isProcessTimeout,
            codewhispererTriggerType: events[0].codewhispererTriggerType,
            codewhispererTypeaheadLength: 0,
            credentialStartUrl: events[0].credentialStartUrl,
            traceId: this.traceId,
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
        const profile = AuthUtil.instance.regionProfileManager.activeRegionProfile
        const generatedLines =
            acceptedRecommendationContent.trim() === '' ? 0 : acceptedRecommendationContent.split('\n').length
        const suggestionCount = this.sessionDecisions
            .map((e) => e.codewhispererSuggestionCount)
            .reduce((a, b) => a + b, 0)

        const aggregated: CodewhispererUserTriggerDecision = {
            codewhispererAutomatedTriggerType: autoTriggerType,
            codewhispererCharactersAccepted: acceptedRecommendationContent.length,
            codewhispererClassifierResult: this.classifierResult,
            codewhispererClassifierThreshold: this.classifierThreshold,
            codewhispererCompletionType: aggregatedCompletionType,
            codewhispererCursorOffset: this.sessionDecisions[0].codewhispererCursorOffset,
            codewhispererCustomizationArn: selectedCustomization.arn === '' ? undefined : selectedCustomization.arn,
            codewhispererFeatureEvaluations: FeatureConfigProvider.instance.getFeatureConfigsTelemetry(),
            codewhispererFirstRequestId: this.sessionDecisions[0].codewhispererFirstRequestId,
            codewhispererGettingStartedTask: session.taskType,
            codewhispererLanguage: language,
            codewhispererLineNumber: this.sessionDecisions[0].codewhispererLineNumber,
            codewhispererPreviousSuggestionState: this.prevTriggerDecision,
            codewhispererSessionId: this.sessionDecisions[0].codewhispererSessionId,
            codewhispererSuggestionCount: suggestionCount,
            codewhispererSuggestionImportCount: this.sessionDecisions
                .map((e) => e.codewhispererSuggestionImportCount || 0)
                .reduce((a, b) => a + b, 0),
            codewhispererSuggestionState: aggregatedSuggestionState,
            codewhispererSupplementalContextIsUtg: supplementalContextMetadata?.isUtg,
            codewhispererSupplementalContextLength: supplementalContextMetadata?.contentsLength,
            // eslint-disable-next-line id-length
            codewhispererSupplementalContextStrategyId: supplementalContextMetadata?.strategy,
            codewhispererSupplementalContextTimeout: supplementalContextMetadata?.isProcessTimeout,
            codewhispererTimeSinceLastDocumentChange: this.timeSinceLastModification
                ? this.timeSinceLastModification
                : undefined,
            codewhispererTimeSinceLastUserDecision: this.lastTriggerDecisionTime
                ? performance.now() - this.lastTriggerDecisionTime
                : undefined,
            codewhispererTimeToFirstRecommendation: session.timeToFirstRecommendation,
            codewhispererTriggerCharacter: autoTriggerType === 'SpecialCharacters' ? this.triggerChar : undefined,
            codewhispererTriggerType: this.sessionDecisions[0].codewhispererTriggerType,
            codewhispererTypeaheadLength: this.typeAheadLength,
            credentialStartUrl: this.sessionDecisions[0].credentialStartUrl,
            traceId: this.traceId,
        }
        telemetry.codewhisperer_userTriggerDecision.emit(aggregated)
        this.prevTriggerDecision = this.getAggregatedSuggestionState(this.sessionDecisions)
        this.lastTriggerDecisionTime = performance.now()

        // When we send a userTriggerDecision for neither Accept nor Reject, service side should not use this value
        // and client side will set this value to 0.0.
        let e2eLatency = this._firstSuggestionShowTime - this._invokeSuggestionStartTime
        if (aggregatedSuggestionState !== 'Reject' && aggregatedSuggestionState !== 'Accept') {
            e2eLatency = 0.0
        }

        codeWhispererClient
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
                        triggerToResponseLatencyMilliseconds: this._timeToFirstRecommendation,
                        perceivedLatencyMilliseconds: this._perceivedLatency,
                        timestamp: new Date(Date.now()),
                        suggestionReferenceCount: referenceCount,
                        generatedLine: generatedLines,
                        numberOfRecommendations: suggestionCount,
                        acceptedCharacterCount: acceptedRecommendationContent.length,
                    },
                },
                profileArn: profile?.arn,
            })
            .then()
            .catch((error) => {
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

    public setTraceId(traceId: string) {
        this.traceId = traceId
    }

    private resetUserTriggerDecisionTelemetry() {
        this.sessionDecisions = []
        this.triggerChar = ''
        this.typeAheadLength = 0
        this.timeSinceLastModification = 0
        this._timeToFirstRecommendation = 0
        this._perceivedLatency = 0
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
        this._invokeSuggestionStartTime = 0
        this._preprocessEndTime = 0
        this._sdkApiCallStartTime = 0
        this._sdkApiCallEndTime = 0
        this._fetchCredentialStartTime = 0
        this._firstSuggestionShowTime = 0
        this._allPaginationEndTime = 0
        this._firstResponseRequestId = ''
    }

    public setPreprocessEndTime() {
        if (this._preprocessEndTime !== 0) {
            getLogger().warn(`inline completion preprocessEndTime has been set and not reset correctly`)
        }
        this._preprocessEndTime = performance.now()
    }

    /** This method is assumed to be invoked first at the start of execution **/
    public setInvokeSuggestionStartTime() {
        this.resetClientComponentLatencyTime()
        this._invokeSuggestionStartTime = performance.now()
    }

    public setSdkApiCallStartTime() {
        if (this._sdkApiCallStartTime === 0) {
            this._sdkApiCallStartTime = performance.now()
        }
    }

    public setSdkApiCallEndTime() {
        if (this._sdkApiCallEndTime === 0 && this._sdkApiCallStartTime !== 0) {
            this._sdkApiCallEndTime = performance.now()
        }
    }

    public setAllPaginationEndTime() {
        if (this._allPaginationEndTime === 0 && this._sdkApiCallEndTime !== 0) {
            this._allPaginationEndTime = performance.now()
        }
    }

    public setFirstSuggestionShowTime() {
        if (this._firstSuggestionShowTime === 0 && this._sdkApiCallEndTime !== 0) {
            this._firstSuggestionShowTime = performance.now()
        }
    }

    public setFetchCredentialStartTime() {
        if (this._fetchCredentialStartTime === 0) {
            this._fetchCredentialStartTime = performance.now()
        }
    }

    public setSessionId(sessionId: string) {
        if (this._sessionId === '') {
            this._sessionId = sessionId
        }
    }

    public setLanguage(language: CodewhispererLanguage) {
        this._language = language
    }

    public setTriggerType(triggerType: CodewhispererTriggerType = 'OnDemand') {
        this._triggerType = triggerType
    }

    public setTimeToFirstRecommendation(time: number) {
        this._timeToFirstRecommendation = time
    }

    public setPerceivedLatency(latency: number) {
        this._perceivedLatency = latency
    }

    public setFirstResponseRequestId(requestId: string) {
        if (this._firstResponseRequestId === '') {
            this._firstResponseRequestId = requestId
        }
    }

    // report client component latency after all pagination call finish
    // and at least one suggestion is shown to the user
    public tryRecordClientComponentLatency() {
        if (this._firstSuggestionShowTime === 0 || this._allPaginationEndTime === 0) {
            return
        }
        telemetry.codewhisperer_clientComponentLatency.emit({
            codewhispererAllCompletionsLatency: this._allPaginationEndTime - this._sdkApiCallStartTime,
            codewhispererCompletionType: 'Line',
            codewhispererCredentialFetchingLatency: 0, // no longer relevant, because we don't re-build the sdk. Flare already has that set
            codewhispererCustomizationArn: getSelectedCustomization().arn,
            codewhispererEndToEndLatency: this._firstSuggestionShowTime - this._invokeSuggestionStartTime,
            codewhispererFirstCompletionLatency: this._sdkApiCallEndTime - this._sdkApiCallStartTime,
            codewhispererLanguage: this._language,
            codewhispererPostprocessingLatency: this._firstSuggestionShowTime - this._sdkApiCallEndTime,
            codewhispererPreprocessingLatency: this._preprocessEndTime - this._invokeSuggestionStartTime,
            codewhispererRequestId: this._firstResponseRequestId,
            codewhispererSessionId: this._sessionId,
            codewhispererTriggerType: this._triggerType,
            credentialStartUrl: AuthUtil.instance.startUrl,
        })
    }
}
