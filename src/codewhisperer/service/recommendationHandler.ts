/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { extensionVersion } from '../../shared/vscode/env'
import {
    RecommendationsList,
    DefaultCodeWhispererClient,
    Recommendation,
    CognitoCredentialsError,
} from '../client/codewhisperer'
import * as EditorContext from '../util/editorContext'
import * as CodeWhispererConstants from '../models/constants'
import { ConfigurationEntry } from '../models/model'
import { runtimeLanguageContext } from '../util/runtimeLanguageContext'
import { AWSError } from 'aws-sdk'
import { TelemetryHelper } from '../util/telemetryHelper'
import { getLogger } from '../../shared/logger'
import { isCloud9 } from '../../shared/extensionUtilities'
import { asyncCallWithTimeout, isAwsError } from '../util/commonUtil'
import * as codewhispererClient from '../client/codewhisperer'
import { showTimedMessage } from '../../shared/utilities/messages'
import { telemetry } from '../../shared/telemetry/telemetry'
import {
    CodewhispererAutomatedTriggerType,
    CodewhispererCompletionType,
    CodewhispererTriggerType,
    Result,
} from '../../shared/telemetry/telemetry'
import { CodeWhispererCodeCoverageTracker } from '../tracker/codewhispererCodeCoverageTracker'
import globals from '../../shared/extensionGlobals'

/**
 * This class is for getRecommendation/listRecommendation API calls and its states
 * It does not contain UI/UX related logic
 */

const performance = globalThis.performance ?? require('perf_hooks').performance

export class RecommendationHandler {
    public lastInvocationTime: number
    public requestId: string
    public sessionId: string
    private nextToken: string
    public errorCode: string
    public recommendations: Recommendation[]
    private recommendationSuggestionState: Map<number, string>
    public startPos: vscode.Position
    private cancellationToken: vscode.CancellationTokenSource
    public errorMessagePrompt: string
    public isGenerateRecommendationInProgress: boolean
    private _onDidReceiveRecommendation: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
    public readonly onDidReceiveRecommendation: vscode.Event<void> = this._onDidReceiveRecommendation.event

    constructor() {
        this.requestId = ''
        this.sessionId = ''
        this.nextToken = ''
        this.errorCode = ''
        this.recommendations = []
        this.lastInvocationTime = performance.now() - CodeWhispererConstants.invocationTimeIntervalThreshold * 1000
        this.startPos = new vscode.Position(0, 0)
        this.cancellationToken = new vscode.CancellationTokenSource()
        this.errorMessagePrompt = ''
        this.recommendationSuggestionState = new Map<number, string>()
        this.isGenerateRecommendationInProgress = false
    }

    static #instance: RecommendationHandler

    public static get instance() {
        return (this.#instance ??= new this())
    }

    isValidResponse(): boolean {
        return (
            this.recommendations !== undefined &&
            this.recommendations.length > 0 &&
            this.recommendations.filter(option => option.content.length > 0).length > 0
        )
    }

    setSuggestionState(index: number, value: string) {
        this.recommendationSuggestionState.set(index, value)
    }

    getSuggestionState(index: number): string | undefined {
        return this.recommendationSuggestionState.get(index)
    }

    async getServerResponse(
        triggerType: CodewhispererTriggerType,
        isManualTriggerOn: boolean,
        isFirstPaginationCall: boolean,
        promise: Promise<any>
    ): Promise<any> {
        const timeoutMessage = isCloud9() ? `Generate recommendation timeout.` : `List recommendation timeout`
        try {
            if (isManualTriggerOn && triggerType === 'OnDemand' && (isCloud9() || isFirstPaginationCall)) {
                return vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: CodeWhispererConstants.pendingResponse,
                        cancellable: false,
                    },
                    async () => {
                        return await asyncCallWithTimeout(
                            promise,
                            timeoutMessage,
                            CodeWhispererConstants.promiseTimeoutLimit * 1000
                        )
                    }
                )
            }
            return await asyncCallWithTimeout(
                promise,
                timeoutMessage,
                CodeWhispererConstants.promiseTimeoutLimit * 1000
            )
        } catch (error) {
            throw new Error(`${error instanceof Error ? error.message : error}`)
        }
    }

    async getRecommendations(
        client: DefaultCodeWhispererClient,
        editor: vscode.TextEditor,
        triggerType: CodewhispererTriggerType,
        config: ConfigurationEntry,
        autoTriggerType?: CodewhispererAutomatedTriggerType,
        pagination: boolean = true,
        page: number = 0
    ) {
        let recommendation: RecommendationsList = []
        let requestId = ''
        let sessionId = ''
        let invocationResult: Result = 'Failed'
        let reason = ''
        let completionType: CodewhispererCompletionType = 'Line'
        let startTime = 0
        let latency = 0
        let nextToken = ''
        let errorCode = ''
        let req: codewhispererClient.ListRecommendationsRequest | codewhispererClient.GenerateRecommendationsRequest
        let shouldRecordServiceInvocation = false

        if (pagination) {
            const accessToken = globals.context.globalState.get<string | undefined>(CodeWhispererConstants.accessToken)
            req = EditorContext.buildListRecommendationRequest(
                editor as vscode.TextEditor,
                this.nextToken,
                accessToken ? undefined : config.isSuggestionsWithCodeReferencesEnabled
            )
        } else {
            req = EditorContext.buildGenerateRecommendationRequest(editor as vscode.TextEditor)
        }

        try {
            startTime = performance.now()
            this.lastInvocationTime = startTime
            // set start pos for non pagination call or first pagination call
            if (!pagination || (pagination && page === 0)) {
                this.startPos = editor.selection.active
            }
            /**
             * Validate request
             */
            if (EditorContext.validateRequest(req)) {
                const mappedReq = runtimeLanguageContext.mapToRuntimeLanguage(req)
                const codewhispererPromise = pagination
                    ? client.listRecommendations(mappedReq)
                    : client.generateRecommendations(mappedReq)
                shouldRecordServiceInvocation = true
                const resp = await this.getServerResponse(
                    triggerType,
                    config.isManualTriggerEnabled,
                    page === 0,
                    codewhispererPromise
                )
                TelemetryHelper.instance.setSdkApiCallEndTime()
                latency = startTime !== 0 ? performance.now() - startTime : 0
                if ('recommendations' in resp) {
                    recommendation = (resp && resp.recommendations) || []
                } else {
                    recommendation = (resp && resp.completions) || []
                }
                invocationResult = 'Succeeded'
                TelemetryHelper.instance.triggerType = triggerType
                TelemetryHelper.instance.CodeWhispererAutomatedtriggerType =
                    autoTriggerType === undefined ? 'KeyStrokeCount' : autoTriggerType
                if (
                    recommendation.length > 0 &&
                    recommendation[0].content.search(CodeWhispererConstants.lineBreak) !== -1
                ) {
                    completionType = 'Block'
                }
                TelemetryHelper.instance.completionType = completionType
                requestId = resp?.$response && resp?.$response?.requestId
                nextToken = resp?.nextToken ? resp?.nextToken : ''
                sessionId = resp?.$response?.httpResponse?.headers['x-amzn-sessionid']
                TelemetryHelper.instance.setFirstResponseRequestId(requestId)
                TelemetryHelper.instance.setSessionId(sessionId)
                if (nextToken === '') {
                    TelemetryHelper.instance.setAllPaginationEndTime()
                }
            } else {
                getLogger().info('Invalid Request : ', JSON.stringify(req, undefined, EditorContext.getTabSize()))
                getLogger().verbose(`Invalid Request : ${JSON.stringify(req, undefined, EditorContext.getTabSize())}`)
                errorCode = `Invalid Request`
                if (!runtimeLanguageContext.isLanguageSupported(req.fileContext.programmingLanguage.languageName)) {
                    this.errorMessagePrompt = `${req.fileContext.programmingLanguage.languageName} is currently not supported by CodeWhisperer`
                }
            }
        } catch (error) {
            if (error instanceof CognitoCredentialsError) {
                shouldRecordServiceInvocation = false
            }
            if (latency === 0) {
                latency = startTime !== 0 ? performance.now() - startTime : 0
            }
            getLogger().error('CodeWhisperer Invocation Exception : ', error)
            getLogger().verbose(`CodeWhisperer Invocation Exception : ${error}`)
            if (isAwsError(error)) {
                const awsError = error as AWSError
                this.errorMessagePrompt = awsError.message
                requestId = awsError.requestId || ''
                errorCode = awsError.code
                reason = `CodeWhisperer Invocation Exception: ${awsError?.code ?? awsError?.name ?? 'unknown'}`
                await this.onThrottlingException(awsError, triggerType)
            } else {
                errorCode = error as string
                reason = error ? String(error) : 'unknown'
                this.errorMessagePrompt = errorCode
            }
        } finally {
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
            const languageContext = runtimeLanguageContext.getLanguageContext(editor.document.languageId)
            getLogger().verbose(
                `Request ID: ${requestId}, timestamp(epoch): ${Date.now()}, timezone: ${timezone}, datetime: ${new Date().toLocaleString(
                    [],
                    {
                        timeZone: timezone,
                    }
                )}, vscode version: '${
                    vscode.version
                }', extension version: '${extensionVersion}', filename: '${EditorContext.getFileName(
                    editor
                )}', left context of line:  '${EditorContext.getLeftContext(
                    editor,
                    this.startPos.line
                )}', line number: ${this.startPos.line}, character location: ${
                    this.startPos.character
                }, latency: ${latency} ms.`
            )
            getLogger().verbose('Recommendations:')
            recommendation.forEach((item, index) => {
                getLogger().verbose(`[${index}]\n${item.content.trimRight()}`)
            })
            if (shouldRecordServiceInvocation) {
                telemetry.codewhisperer_serviceInvocation.emit({
                    codewhispererRequestId: requestId ? requestId : undefined,
                    codewhispererSessionId: sessionId ? sessionId : undefined,
                    codewhispererLastSuggestionIndex: this.recommendations.length - 1,
                    codewhispererTriggerType: triggerType,
                    codewhispererAutomatedTriggerType: autoTriggerType,
                    codewhispererCompletionType:
                        invocationResult == 'Succeeded' ? TelemetryHelper.instance.completionType : undefined,
                    result: invocationResult,
                    duration: latency ? latency : 0,
                    codewhispererLineNumber: this.startPos.line ? this.startPos.line : 0,
                    codewhispererCursorOffset: TelemetryHelper.instance.cursorOffset
                        ? TelemetryHelper.instance.cursorOffset
                        : 0,
                    codewhispererLanguage: languageContext.language,
                    reason: reason ? reason.substring(0, 200) : undefined,
                    credentialStartUrl: TelemetryHelper.instance.startUrl,
                })
            }
            if (invocationResult == 'Succeeded') {
                CodeWhispererCodeCoverageTracker.getTracker(languageContext.language)?.incrementServiceInvocationCount()
            }
        }
        if (recommendation.length > 0) {
            const typedPrefix = editor.document
                .getText(new vscode.Range(this.startPos, editor.selection.active))
                .replace('\r\n', '\n')
            // mark suggestions that does not match typeahead when arrival as Discard
            // these suggestions can be marked as Showed if typeahead can be removed with new inline API
            recommendation.forEach((r, i) => {
                if (
                    (!r.content.startsWith(typedPrefix) &&
                        this.getSuggestionState(i + this.recommendations.length) === undefined) ||
                    this.cancellationToken.token.isCancellationRequested
                ) {
                    this.setSuggestionState(i + this.recommendations.length, 'Discard')
                }
            })
            this.recommendations = isCloud9() ? recommendation : this.recommendations.concat(recommendation)
            this._onDidReceiveRecommendation.fire()
        }
        // send Empty userDecision event if user receives no recommendations in this session at all.
        if (this.recommendations.length === 0 && nextToken === '') {
            TelemetryHelper.instance.recordUserDecisionTelemetryForEmptyList(
                requestId,
                sessionId,
                page,
                editor.document.languageId
            )
        }
        this.requestId = requestId
        this.sessionId = sessionId
        this.nextToken = nextToken
        this.errorCode = errorCode
    }

    cancelPaginatedRequest() {
        this.nextToken = ''
        this.cancellationToken.cancel()
    }

    checkAndResetCancellationTokens() {
        if (this.cancellationToken.token.isCancellationRequested) {
            this.cancellationToken.dispose()
            this.cancellationToken = new vscode.CancellationTokenSource()
            this.nextToken = ''
            return true
        }
        return false
    }
    /**
     * Clear recommendation state
     */
    clearRecommendations() {
        this.recommendations = []
        this.recommendationSuggestionState = new Map<number, string>()
        this.errorCode = ''
        this.requestId = ''
        this.sessionId = ''
        this.nextToken = ''
        this.errorMessagePrompt = ''
    }

    /**
     * Emits telemetry reflecting user decision for current recommendation.
     */
    reportUserDecisionOfRecommendation(editor: vscode.TextEditor | undefined, acceptIndex: number) {
        TelemetryHelper.instance.recordUserDecisionTelemetry(
            this.requestId,
            this.sessionId,
            this.recommendations,
            acceptIndex,
            editor?.document.languageId,
            this.recommendations.length,
            this.recommendationSuggestionState
        )
    }

    hasNextToken(): boolean {
        return this.nextToken !== ''
    }

    canShowRecommendationInIntelliSense(editor: vscode.TextEditor, showPrompt: boolean = false): boolean {
        const reject = () => {
            this.reportUserDecisionOfRecommendation(editor, -1)
            this.clearRecommendations()
        }
        if (!this.isValidResponse()) {
            if (showPrompt) {
                showTimedMessage(
                    this.errorMessagePrompt === '' ? CodeWhispererConstants.noSuggestions : this.errorMessagePrompt,
                    3000
                )
            }
            reject()
            return false
        }
        // do not show recommendation if cursor is before invocation position
        // also mark as Discard
        if (editor.selection.active.isBefore(this.startPos)) {
            this.recommendations.forEach((r, i) => {
                this.setSuggestionState(i, 'Discard')
            })
            reject()
            return false
        }

        // do not show recommendation if typeahead does not match
        // also mark as Discard
        const typedPrefix = editor.document.getText(
            new vscode.Range(
                this.startPos.line,
                this.startPos.character,
                editor.selection.active.line,
                editor.selection.active.character
            )
        )
        if (!this.recommendations[0].content.startsWith(typedPrefix.trimStart())) {
            this.recommendations.forEach((r, i) => {
                this.setSuggestionState(i, 'Discard')
            })
            reject()
            return false
        }
        return true
    }

    moveStartPositionToSkipSpaces(editor: vscode.TextEditor) {
        const start = this.startPos
        const prefix = editor.document.getText(new vscode.Range(start, editor.selection.active))
        // skip space from invocation position
        if (prefix.length > 0 && prefix.trimStart().length != prefix.length) {
            this.startPos = start.translate(undefined, prefix.length - prefix.trimStart().length)
        }
    }

    async onThrottlingException(awsError: AWSError, triggerType: CodewhispererTriggerType) {
        if (
            awsError.code === 'ThrottlingException' &&
            awsError.message.includes(CodeWhispererConstants.throttlingMessage)
        ) {
            if (triggerType === 'OnDemand') {
                vscode.window.showErrorMessage(CodeWhispererConstants.freeTierLimitReached)
            }
            await vscode.commands.executeCommand('aws.codeWhisperer.refresh', true)
        }
    }
}
