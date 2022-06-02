/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as telemetry from '../../../shared/telemetry/telemetry'
import { extensionVersion } from '../../../shared/vscode/env'
import { RecommendationsList, DefaultConsolasClient, RecommendationDetail } from '../client/consolas'
import * as EditorContext from '../util/editorContext'
import { ConsolasConstants } from '../models/constants'
import { ConfigurationEntry } from '../models/model'
import { runtimeLanguageContext } from '../../../vector/consolas/util/runtimeLanguageContext'
import { AWSError } from 'aws-sdk'
import { TelemetryHelper } from '../util/telemetryHelper'
import { getLogger } from '../../../shared/logger'
import { UnsupportedLanguagesCache } from '../util/unsupportedLanguagesCache'
import { isCloud9 } from '../../../shared/extensionUtilities'
import { asyncCallWithTimeout, isAwsError } from '../util/commonUtil'
import * as consolasClient from '../client/consolas'

/**
 * This class is for getRecommendation/listRecommendation API calls and its states
 * It does not contain UI/UX related logic
 */

//if this is browser it uses browser and if it's node then it uses nodes
//TODO remove when node version >= 16
const performance = globalThis.performance ?? require('perf_hooks').performance

export class RecommendationHandler {
    public lastInvocationTime: number
    public requestId: string
    public sessionId: string
    private nextToken: string
    public errorCode: string
    public recommendations: RecommendationDetail[]
    public startPos: vscode.Position
    private cancellationToken: vscode.CancellationTokenSource
    public errorMessagePrompt: string

    constructor() {
        this.requestId = ''
        this.sessionId = ''
        this.nextToken = ''
        this.errorCode = ''
        this.recommendations = []
        this.lastInvocationTime = performance.now() - ConsolasConstants.invocationTimeIntervalThreshold * 1000
        this.startPos = new vscode.Position(0, 0)
        this.cancellationToken = new vscode.CancellationTokenSource()
        this.errorMessagePrompt = ''
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

    async getServerResponse(
        triggerType: telemetry.ConsolasTriggerType,
        isManualTriggerOn: boolean,
        promise: Promise<any>
    ): Promise<any> {
        try {
            if (isManualTriggerOn && triggerType === 'OnDemand' && isCloud9()) {
                return vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: ConsolasConstants.pendingResponse,
                        cancellable: false,
                    },
                    async () => {
                        return await asyncCallWithTimeout(
                            promise,
                            'Consolas promise timeout',
                            ConsolasConstants.promiseTimeoutLimit * 1000
                        )
                    }
                )
            }
            return await asyncCallWithTimeout(
                promise,
                'Consolas promise timeout',
                ConsolasConstants.promiseTimeoutLimit * 1000
            )
        } catch (error) {
            throw new Error(`${error instanceof Error ? error.message : error}`)
        }
    }

    async getRecommendations(
        client: DefaultConsolasClient,
        editor: vscode.TextEditor,
        triggerType: telemetry.ConsolasTriggerType,
        config: ConfigurationEntry,
        autoTriggerType?: telemetry.ConsolasAutomatedtriggerType,
        pagination: boolean = true,
        page: number = 0
    ) {
        let recommendation: RecommendationsList = []
        let requestId = ''
        let sessionId = ''
        let invocationResult: telemetry.Result = 'Failed'
        let reason = ''
        let completionType: telemetry.ConsolasCompletionType = 'Line'
        let startTime = 0
        let latency = 0
        let nextToken = ''
        let errorCode = ''
        let req: consolasClient.ListRecommendationsRequest | consolasClient.GenerateRecommendationsRequest

        if (pagination) {
            req = EditorContext.buildListRecommendationRequest(editor as vscode.TextEditor, this.nextToken)
        } else {
            req = EditorContext.buildGenerateRecommendationRequest(editor as vscode.TextEditor)
        }

        try {
            startTime = performance.now()
            this.lastInvocationTime = startTime
            // set start pos for non pagination call or first pagination call
            if (!pagination || (pagination && page === 0)) this.startPos = editor.selection.active

            /**
             * Validate request
             */
            if (EditorContext.validateRequest(req)) {
                const consolasPromise = pagination
                    ? client.listRecommendations(req)
                    : client.generateRecommendations(req)
                const resp = await this.getServerResponse(triggerType, config.isManualTriggerEnabled, consolasPromise)
                latency = startTime !== 0 ? performance.now() - startTime : 0
                recommendation = (resp && resp.recommendations) || []
                getLogger().verbose('Consolas Recommendations : ', recommendation[0].content)
                invocationResult = 'Succeeded'
                TelemetryHelper.instance.triggerType = triggerType
                TelemetryHelper.instance.ConsolasAutomatedtriggerType =
                    autoTriggerType === undefined ? 'KeyStrokeCount' : autoTriggerType
                if (recommendation.length > 0 && recommendation[0].content.search(ConsolasConstants.lineBreak) !== -1) {
                    completionType = 'Block'
                }
                TelemetryHelper.instance.completionType = completionType
                requestId = resp?.$response && resp?.$response?.requestId
                nextToken = resp?.nextToken ? resp?.nextToken : ''
                sessionId = resp?.$response?.httpResponse?.headers['x-amzn-sessionid']
            } else {
                getLogger().info('Invalid Request : ', JSON.stringify(req, undefined, EditorContext.getTabSize()))
                getLogger().verbose(`Invalid Request : ${JSON.stringify(req, undefined, EditorContext.getTabSize())}`)
                errorCode = `Invalid Request`
            }
        } catch (error) {
            if (latency === 0) {
                latency = startTime !== 0 ? performance.now() - startTime : 0
            }
            getLogger().error('Consolas Invocation Exception : ', error)
            getLogger().verbose(`Consolas Invocation Exception : ${error}`)
            if (isAwsError(error)) {
                const awsError = error as AWSError
                if (
                    awsError.code === 'ValidationException' &&
                    awsError.message.includes(`contextInfo.programmingLanguage.languageName`)
                ) {
                    let languageName = req.contextInfo.programmingLanguage.languageName
                    UnsupportedLanguagesCache.addUnsupportedProgrammingLanguage(languageName)
                    languageName = `${languageName.charAt(0).toUpperCase()}${languageName.slice(1)}`
                    this.errorMessagePrompt = `Programming language ${languageName} is currently not supported by Consolas`
                } else if (awsError.code === 'CredentialsError') {
                    this.errorMessagePrompt = `Invalid AWS credential. Please use a valid AWS credential`
                }
                requestId = awsError.requestId || ''
                errorCode = awsError.code
                reason = `Consolas Invocation Exception: ${awsError?.code ?? awsError?.name ?? 'unknown'}`
            } else {
                errorCode = error as string
                reason = error as string
            }
        } finally {
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
            const languageId = editor?.document?.languageId
            const languageContext = runtimeLanguageContext.getLanguageContext(languageId)
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

            /**
             * TODO: fill in runtime fields after solution is found to access runtime in vscode
             */
            telemetry.recordConsolasServiceInvocation({
                consolasRequestId: requestId,
                consolasSessionId: sessionId ? sessionId : undefined,
                consolasSuggestionIndex: this.recommendations.length,
                consolasTriggerType: triggerType,
                consolasAutomatedtriggerType: autoTriggerType,
                consolasCompletionType:
                    invocationResult == 'Succeeded' ? TelemetryHelper.instance.completionType : undefined,
                result: invocationResult,
                duration: latency,
                consolasLineNumber: this.startPos.line,
                consolasCursorOffset: TelemetryHelper.instance.cursorOffset,
                consolasLanguage: languageContext.language,
                consolasRuntime: languageContext.runtimeLanguage,
                consolasRuntimeSource: languageContext.runtimeLanguageSource,
                reason: reason ? reason : undefined,
            })
            if (config.isIncludeSuggestionsWithCodeReferencesEnabled === false) {
                const filteredRecommendationList: RecommendationsList = []
                recommendation.forEach((r, index) => {
                    if (r.references === undefined || r.references.length === 0) {
                        filteredRecommendationList.push(r)
                    } else {
                        this.reportUserDecisionOfCurrentRecommendation(index, editor?.document?.languageId, true)
                    }
                })
                recommendation = filteredRecommendationList
            }
        }

        this.recommendations = this.recommendations.concat(recommendation)
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
        this.errorCode = ''
        this.requestId = ''
        this.sessionId = ''
        this.nextToken = ''
        this.errorMessagePrompt = ''
    }
    /**
     * VScode IntelliSense has native matching for recommendation.
     * This is only to check if the recommendation match the updated left context when
     * user keeps typing before getting consolas response back.
     * @param newConsolasRequest if newConsolasRequest, then we need to reset the invocationContext.isPrefixMatched, which is used as
     *                           part of user decision telemetry (see models.ts for more details)
     * @param editor the current VSCode editor
     *
     * @returns
     */
    updatePrefixMatchArray(newConsolasRequest: boolean, editor: vscode.TextEditor | undefined) {
        if (!editor || !this.isValidResponse() || !newConsolasRequest) {
            return
        }
        // Only works for cloud9, as it works for completion items
        if (isCloud9() && this.startPos.line !== editor.selection.active.line) {
            return
        }

        let typedPrefix = ''
        if (newConsolasRequest) {
            TelemetryHelper.instance.isPrefixMatched = []
        }

        typedPrefix = editor.document.getText(new vscode.Range(this.startPos, editor.selection.active))

        this.recommendations.forEach(recommendation => {
            if (recommendation.content.startsWith(typedPrefix)) {
                /**
                 * TODO: seems like VScode has native prefix matching for completion items
                 * if this behavior is changed, then we need to update the string manually
                 * e.g., recommendation.content = recommendation.content.substring(changedContextLength)
                 */
                if (newConsolasRequest) {
                    TelemetryHelper.instance.isPrefixMatched.push(true)
                }
            } else {
                if (newConsolasRequest) {
                    TelemetryHelper.instance.isPrefixMatched.push(false)
                }
            }
        })
    }
    reportUserDecisionOfCurrentRecommendation(acceptIndex: number, languageId: string | undefined, filtered = false) {
        TelemetryHelper.instance.recordUserDecisionTelemetry(
            this.requestId,
            this.sessionId,
            this.recommendations,
            acceptIndex,
            languageId,
            filtered,
            this.recommendations.length
        )
    }

    hasNextToken(): boolean {
        return this.nextToken !== ''
    }
}
