/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthUtil, getSelectedCustomization } from 'aws-core-vscode/codewhisperer'
import { CodewhispererLanguage } from 'aws-core-vscode/shared'
import { CodewhispererTriggerType, telemetry } from 'aws-core-vscode/telemetry'
import { InlineCompletionTriggerKind } from 'vscode'

export class TelemetryHelper {
    // Variables needed for client component latency
    private _invokeSuggestionStartTime = 0
    private _preprocessEndTime = 0
    private _sdkApiCallStartTime = 0
    private _sdkApiCallEndTime = 0
    private _allPaginationEndTime = 0
    private _firstSuggestionShowTime = 0
    private _firstResponseRequestId = ''
    private _sessionId = ''
    private _language: CodewhispererLanguage = 'java'
    private _triggerType: CodewhispererTriggerType = 'OnDemand'

    constructor() {}

    static #instance: TelemetryHelper

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public resetClientComponentLatencyTime() {
        this._invokeSuggestionStartTime = 0
        this._preprocessEndTime = 0
        this._sdkApiCallStartTime = 0
        this._sdkApiCallEndTime = 0
        this._firstSuggestionShowTime = 0
        this._allPaginationEndTime = 0
        this._firstResponseRequestId = ''
    }

    public setInvokeSuggestionStartTime() {
        this.resetClientComponentLatencyTime()
        this._invokeSuggestionStartTime = performance.now()
    }

    get invokeSuggestionStartTime(): number {
        return this._invokeSuggestionStartTime
    }

    public setPreprocessEndTime() {
        this._preprocessEndTime = performance.now()
    }

    get preprocessEndTime(): number {
        return this._preprocessEndTime
    }

    public setSdkApiCallStartTime() {
        if (this._sdkApiCallStartTime === 0) {
            this._sdkApiCallStartTime = performance.now()
        }
    }

    get sdkApiCallStartTime(): number {
        return this._sdkApiCallStartTime
    }

    public setSdkApiCallEndTime() {
        if (this._sdkApiCallEndTime === 0 && this._sdkApiCallStartTime !== 0) {
            this._sdkApiCallEndTime = performance.now()
        }
    }

    get sdkApiCallEndTime(): number {
        return this._sdkApiCallEndTime
    }

    public setAllPaginationEndTime() {
        if (this._allPaginationEndTime === 0 && this._sdkApiCallEndTime !== 0) {
            this._allPaginationEndTime = performance.now()
        }
    }

    get allPaginationEndTime(): number {
        return this._allPaginationEndTime
    }

    public setFirstSuggestionShowTime() {
        if (this._firstSuggestionShowTime === 0 && this._sdkApiCallEndTime !== 0) {
            this._firstSuggestionShowTime = performance.now()
        }
    }

    get firstSuggestionShowTime(): number {
        return this._firstSuggestionShowTime
    }

    public setFirstResponseRequestId(requestId: string) {
        if (this._firstResponseRequestId === '') {
            this._firstResponseRequestId = requestId
        }
    }

    get firstResponseRequestId(): string {
        return this._firstResponseRequestId
    }

    public setSessionId(sessionId: string) {
        if (this._sessionId === '') {
            this._sessionId = sessionId
        }
    }

    get sessionId(): string {
        return this._sessionId
    }

    public setLanguage(language: CodewhispererLanguage) {
        this._language = language
    }

    get language(): CodewhispererLanguage {
        return this._language
    }

    public setTriggerType(triggerType: InlineCompletionTriggerKind) {
        if (triggerType === InlineCompletionTriggerKind.Invoke) {
            this._triggerType = 'OnDemand'
        } else if (triggerType === InlineCompletionTriggerKind.Automatic) {
            this._triggerType = 'AutoTrigger'
        }
    }

    get triggerType(): string {
        return this._triggerType
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
