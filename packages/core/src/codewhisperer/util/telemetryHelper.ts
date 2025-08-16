/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import globals from '../../shared/extensionGlobals'

import { runtimeLanguageContext } from './runtimeLanguageContext'
import { codeWhispererClient as client } from '../client/codewhisperer'
import { CodewhispererGettingStartedTask, CodewhispererLanguage, telemetry } from '../../shared/telemetry/telemetry'
import { CodewhispererCompletionType } from '../../shared/telemetry/telemetry'
import { CodeWhispererSettings } from './codewhispererSettings'
import { getSelectedCustomization } from './customizationUtil'
import { AuthUtil } from './authUtil'
import { isAwsError } from '../../shared/errors'
import { getLogger } from '../../shared/logger/logger'
import { session } from './codeWhispererSession'
import { CodeWhispererSupplementalContext } from '../models/model'
import { CodeScanRemediationsEventType } from '../client/codewhispereruserclient'
import { CodeAnalysisScope as CodeAnalysisScopeClientSide } from '../models/constants'

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

    public getCompletionType(i: number, completionTypes: Map<number, CodewhispererCompletionType>) {
        return completionTypes.get(i) || 'Line'
    }

    public isTelemetryEnabled(): boolean {
        return globals.telemetry.telemetryEnabled
    }

    public resetClientComponentLatencyTime() {
        session.invokeSuggestionStartTime = 0
        session.preprocessEndTime = 0
        session.sdkApiCallStartTime = 0
        this._sdkApiCallEndTime = 0
        session.fetchCredentialStartTime = 0
        session.firstSuggestionShowTime = 0
        this._allPaginationEndTime = 0
        this._firstResponseRequestId = ''
    }

    public setPreprocessEndTime() {
        if (session.preprocessEndTime !== 0) {
            getLogger().warn(`inline completion preprocessEndTime has been set and not reset correctly`)
        }
        session.preprocessEndTime = performance.now()
    }

    /** This method is assumed to be invoked first at the start of execution **/
    public setInvokeSuggestionStartTime() {
        this.resetClientComponentLatencyTime()
        session.invokeSuggestionStartTime = performance.now()
    }

    public setSdkApiCallEndTime() {
        if (this._sdkApiCallEndTime === 0 && session.sdkApiCallStartTime !== 0) {
            this._sdkApiCallEndTime = performance.now()
        }
    }

    public setAllPaginationEndTime() {
        if (this._allPaginationEndTime === 0 && this._sdkApiCallEndTime !== 0) {
            this._allPaginationEndTime = performance.now()
        }
    }

    public setFirstSuggestionShowTime() {
        if (session.firstSuggestionShowTime === 0 && this._sdkApiCallEndTime !== 0) {
            session.firstSuggestionShowTime = performance.now()
        }
    }

    public setFirstResponseRequestId(requestId: string) {
        if (this._firstResponseRequestId === '') {
            this._firstResponseRequestId = requestId
        }
    }

    // report client component latency after all pagination call finish
    // and at least one suggestion is shown to the user
    public tryRecordClientComponentLatency() {
        if (session.firstSuggestionShowTime === 0 || this._allPaginationEndTime === 0) {
            return
        }
        telemetry.codewhisperer_clientComponentLatency.emit({
            codewhispererAllCompletionsLatency: this._allPaginationEndTime - session.sdkApiCallStartTime,
            codewhispererCompletionType: 'Line',
            codewhispererCredentialFetchingLatency: session.sdkApiCallStartTime - session.fetchCredentialStartTime,
            codewhispererCustomizationArn: getSelectedCustomization().arn,
            codewhispererEndToEndLatency: session.firstSuggestionShowTime - session.invokeSuggestionStartTime,
            codewhispererFirstCompletionLatency: this._sdkApiCallEndTime - session.sdkApiCallStartTime,
            codewhispererLanguage: session.language,
            codewhispererPostprocessingLatency: session.firstSuggestionShowTime - this._sdkApiCallEndTime,
            codewhispererPreprocessingLatency: session.preprocessEndTime - session.invokeSuggestionStartTime,
            codewhispererRequestId: this._firstResponseRequestId,
            codewhispererSessionId: session.sessionId,
            codewhispererTriggerType: session.triggerType,
            credentialStartUrl: AuthUtil.instance.startUrl,
        })
    }
    public sendCodeScanEvent(languageId: string, jobId: string) {
        getLogger().debug(`start sendCodeScanEvent: jobId: "${jobId}", languageId: "${languageId}"`)

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
                profileArn: AuthUtil.instance.regionProfileManager.activeRegionProfile?.arn,
            })
            .then()
            .catch((error) => {
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

    public sendCodeScanSucceededEvent(
        language: string,
        jobId: string,
        numberOfFindings: number,
        scope: CodeAnalysisScopeClientSide
    ) {
        client
            .sendTelemetryEvent({
                telemetryEvent: {
                    codeScanSucceededEvent: {
                        programmingLanguage: {
                            languageName: runtimeLanguageContext.toRuntimeLanguage(language as CodewhispererLanguage),
                        },
                        codeScanJobId: jobId,
                        numberOfFindings: numberOfFindings,
                        timestamp: new Date(Date.now()),
                        codeAnalysisScope: scope === CodeAnalysisScopeClientSide.FILE_AUTO ? 'FILE' : 'PROJECT',
                    },
                },
                profileArn: AuthUtil.instance.regionProfileManager.activeRegionProfile?.arn,
            })
            .then()
            .catch((error) => {
                let requestId: string | undefined
                if (isAwsError(error)) {
                    requestId = error.requestId
                }

                getLogger().debug(
                    `Failed to sendTelemetryEvent for code scan success, requestId: ${requestId ?? ''}, message: ${
                        error.message
                    }`
                )
            })
    }

    public sendCodeScanFailedEvent(language: string, jobId: string, scope: CodeAnalysisScopeClientSide) {
        client
            .sendTelemetryEvent({
                telemetryEvent: {
                    codeScanFailedEvent: {
                        programmingLanguage: {
                            languageName: runtimeLanguageContext.toRuntimeLanguage(language as CodewhispererLanguage),
                        },
                        codeScanJobId: jobId,
                        codeAnalysisScope: scope === CodeAnalysisScopeClientSide.FILE_AUTO ? 'FILE' : 'PROJECT',
                        timestamp: new Date(Date.now()),
                    },
                },
                profileArn: AuthUtil.instance.regionProfileManager.activeRegionProfile?.arn,
            })
            .then()
            .catch((error) => {
                let requestId: string | undefined
                if (isAwsError(error)) {
                    requestId = error.requestId
                }
                getLogger().debug(
                    `Failed to sendTelemetryEvent for code scan failure, requestId: ${requestId ?? ''}, message: ${
                        error.message
                    }`
                )
            })
    }

    public sendCodeFixGenerationEvent(
        jobId: string,
        language?: string,
        ruleId?: string,
        detectorId?: string,
        linesOfCodeGenerated?: number,
        charsOfCodeGenerated?: number
    ) {
        client
            .sendTelemetryEvent({
                telemetryEvent: {
                    codeFixGenerationEvent: {
                        programmingLanguage: {
                            languageName: runtimeLanguageContext.toRuntimeLanguage(language as CodewhispererLanguage),
                        },
                        jobId,
                        ruleId,
                        detectorId,
                        linesOfCodeGenerated,
                        charsOfCodeGenerated,
                    },
                },
                profileArn: AuthUtil.instance.regionProfileManager.activeRegionProfile?.arn,
            })
            .then()
            .catch((error) => {
                let requestId: string | undefined
                if (isAwsError(error)) {
                    requestId = error.requestId
                }
                getLogger().debug(
                    `Failed to sendTelemetryEvent for code fix generation, requestId: ${requestId ?? ''}, message: ${
                        error.message
                    }`
                )
            })
    }

    public sendCodeFixAcceptanceEvent(
        jobId: string,
        language?: string,
        ruleId?: string,
        detectorId?: string,
        linesOfCodeAccepted?: number,
        charsOfCodeAccepted?: number
    ) {
        client
            .sendTelemetryEvent({
                telemetryEvent: {
                    codeFixAcceptanceEvent: {
                        programmingLanguage: {
                            languageName: runtimeLanguageContext.toRuntimeLanguage(language as CodewhispererLanguage),
                        },
                        jobId,
                        ruleId,
                        detectorId,
                        linesOfCodeAccepted,
                        charsOfCodeAccepted,
                    },
                },
                profileArn: AuthUtil.instance.regionProfileManager.activeRegionProfile?.arn,
            })
            .then()
            .catch((error) => {
                let requestId: string | undefined
                if (isAwsError(error)) {
                    requestId = error.requestId
                }
                getLogger().debug(
                    `Failed to sendTelemetryEvent for code fix acceptance, requestId: ${requestId ?? ''}, message: ${
                        error.message
                    }`
                )
            })
    }

    public sendTestGenerationEvent(
        groupName: string,
        jobId: string,
        language?: string,
        numberOfUnitTestCasesGenerated?: number,
        numberOfUnitTestCasesAccepted?: number,
        linesOfCodeGenerated?: number,
        linesOfCodeAccepted?: number,
        charsOfCodeGenerated?: number,
        charsOfCodeAccepted?: number
    ) {
        client
            .sendTelemetryEvent({
                telemetryEvent: {
                    testGenerationEvent: {
                        programmingLanguage: {
                            languageName: runtimeLanguageContext.toRuntimeLanguage(language as CodewhispererLanguage),
                        },
                        jobId,
                        groupName,
                        ideCategory: 'VSCODE',
                        numberOfUnitTestCasesGenerated,
                        numberOfUnitTestCasesAccepted,
                        linesOfCodeGenerated,
                        linesOfCodeAccepted,
                        charsOfCodeGenerated,
                        charsOfCodeAccepted,
                        timestamp: new Date(Date.now()),
                    },
                },
                profileArn: AuthUtil.instance.regionProfileManager.activeRegionProfile?.arn,
            })
            .then()
            .catch((error) => {
                let requestId: string | undefined
                if (isAwsError(error)) {
                    requestId = error.requestId
                }
                getLogger().debug(
                    `Failed to sendTelemetryEvent for test generation, requestId: ${requestId ?? ''}, message: ${
                        error.message
                    }`
                )
            })
    }

    public sendCodeScanRemediationsEvent(
        languageId?: string,
        codeScanRemediationEventType?: CodeScanRemediationsEventType,
        detectorId?: string,
        findingId?: string,
        ruleId?: string,
        component?: string,
        reason?: string,
        result?: string,
        includesFix?: boolean
    ) {
        client
            .sendTelemetryEvent({
                telemetryEvent: {
                    codeScanRemediationsEvent: {
                        programmingLanguage: languageId
                            ? {
                                  languageName: runtimeLanguageContext.toRuntimeLanguage(
                                      languageId as CodewhispererLanguage
                                  ),
                              }
                            : undefined,
                        CodeScanRemediationsEventType: codeScanRemediationEventType,
                        detectorId: detectorId,
                        findingId: findingId,
                        ruleId: ruleId,
                        component: component,
                        reason: reason,
                        result: result,
                        includesFix: includesFix,
                        timestamp: new Date(Date.now()),
                    },
                },
                profileArn: AuthUtil.instance.regionProfileManager.activeRegionProfile?.arn,
            })
            .then()
            .catch((error) => {
                let requestId: string | undefined
                if (isAwsError(error)) {
                    requestId = error.requestId
                }
                getLogger().debug(
                    `Failed to sendCodeScanRemediationsEvent to CodeWhisperer, requestId: ${
                        requestId ?? ''
                    }, message: ${error.message}`
                )
            })
    }
}
