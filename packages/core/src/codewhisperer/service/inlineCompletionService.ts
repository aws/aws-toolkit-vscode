/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { CodeSuggestionsState, ConfigurationEntry, GetRecommendationsResponse, vsCodeState } from '../models/model'
import * as CodeWhispererConstants from '../models/constants'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
import { RecommendationHandler } from './recommendationHandler'
import { CodewhispererAutomatedTriggerType, CodewhispererTriggerType } from '../../shared/telemetry/telemetry'
import { showTimedMessage } from '../../shared/utilities/messages'
import { getLogger } from '../../shared/logger/logger'
import { TelemetryHelper } from '../util/telemetryHelper'
import { AuthUtil } from '../util/authUtil'
import { shared } from '../../shared/utilities/functionUtils'
import { ClassifierTrigger } from './classifierTrigger'
import { session } from '../util/codeWhispererSession'
import { noSuggestions } from '../models/constants'
import { CodeWhispererStatusBarManager } from './statusBar'

export class InlineCompletionService {
    private maxPage = 100
    private statusBar: CodeWhispererStatusBarManager
    private _showRecommendationTimer?: NodeJS.Timer

    constructor(statusBar: CodeWhispererStatusBarManager = CodeWhispererStatusBarManager.instance) {
        this.statusBar = statusBar

        RecommendationHandler.instance.onDidReceiveRecommendation((e) => {
            this.startShowRecommendationTimer()
        })

        CodeSuggestionsState.instance.onDidChangeState(() => {
            return this.statusBar.refreshStatusBar()
        })
    }

    static #instance: InlineCompletionService

    public static get instance() {
        return (this.#instance ??= new this())
    }

    filePath(): string | undefined {
        return RecommendationHandler.instance.documentUri?.fsPath
    }

    private sharedTryShowRecommendation = shared(
        RecommendationHandler.instance.tryShowRecommendation.bind(RecommendationHandler.instance)
    )

    private startShowRecommendationTimer() {
        if (this._showRecommendationTimer) {
            clearInterval(this._showRecommendationTimer)
            this._showRecommendationTimer = undefined
        }
        this._showRecommendationTimer = setInterval(() => {
            const delay = Date.now() - vsCodeState.lastUserModificationTime
            if (delay < CodeWhispererConstants.inlineSuggestionShowDelay) {
                return
            }
            this.sharedTryShowRecommendation()
                .catch((e) => {
                    getLogger().error('tryShowRecommendation failed: %s', (e as Error).message)
                })
                .finally(() => {
                    if (this._showRecommendationTimer) {
                        clearInterval(this._showRecommendationTimer)
                        this._showRecommendationTimer = undefined
                    }
                })
        }, CodeWhispererConstants.showRecommendationTimerPollPeriod)
    }

    async getPaginatedRecommendation(
        client: DefaultCodeWhispererClient,
        editor: vscode.TextEditor,
        triggerType: CodewhispererTriggerType,
        config: ConfigurationEntry,
        autoTriggerType?: CodewhispererAutomatedTriggerType,
        event?: vscode.TextDocumentChangeEvent
    ): Promise<GetRecommendationsResponse> {
        if (vsCodeState.isCodeWhispererEditing || RecommendationHandler.instance.isSuggestionVisible()) {
            return {
                result: 'Failed',
                errorMessage: 'Amazon Q is already running',
                recommendationCount: 0,
            }
        }

        // Call report user decisions once to report recommendations leftover from last invocation.
        RecommendationHandler.instance.reportUserDecisions(-1)
        TelemetryHelper.instance.setInvokeSuggestionStartTime()
        ClassifierTrigger.instance.recordClassifierResultForAutoTrigger(editor, autoTriggerType, event)

        const triggerChar = event?.contentChanges[0]?.text
        if (autoTriggerType === 'SpecialCharacters' && triggerChar) {
            TelemetryHelper.instance.setTriggerCharForUserTriggerDecision(triggerChar)
        }
        const isAutoTrigger = triggerType === 'AutoTrigger'
        if (AuthUtil.instance.isConnectionExpired()) {
            await AuthUtil.instance.notifyReauthenticate(isAutoTrigger)
            return {
                result: 'Failed',
                errorMessage: 'auth',
                recommendationCount: 0,
            }
        }

        await this.statusBar.setLoading()

        RecommendationHandler.instance.checkAndResetCancellationTokens()
        RecommendationHandler.instance.documentUri = editor.document.uri
        let response: GetRecommendationsResponse = {
            result: 'Failed',
            errorMessage: undefined,
            recommendationCount: 0,
        }
        try {
            let page = 0
            while (page < this.maxPage) {
                response = await RecommendationHandler.instance.getRecommendations(
                    client,
                    editor,
                    triggerType,
                    config,
                    autoTriggerType,
                    true,
                    page
                )
                if (RecommendationHandler.instance.checkAndResetCancellationTokens()) {
                    RecommendationHandler.instance.reportUserDecisions(-1)
                    await vscode.commands.executeCommand('aws.amazonq.refreshStatusBar')
                    if (triggerType === 'OnDemand' && session.recommendations.length === 0) {
                        void showTimedMessage(response.errorMessage ? response.errorMessage : noSuggestions, 2000)
                    }
                    return {
                        result: 'Failed',
                        errorMessage: 'cancelled',
                        recommendationCount: 0,
                    }
                }
                if (!RecommendationHandler.instance.hasNextToken()) {
                    break
                }
                page++
            }
        } catch (error) {
            getLogger().error(`Error ${error} in getPaginatedRecommendation`)
        }
        await vscode.commands.executeCommand('aws.amazonq.refreshStatusBar')
        if (triggerType === 'OnDemand' && session.recommendations.length === 0) {
            void showTimedMessage(response.errorMessage ? response.errorMessage : noSuggestions, 2000)
        }
        TelemetryHelper.instance.tryRecordClientComponentLatency()

        return {
            result: 'Succeeded',
            errorMessage: undefined,
            recommendationCount: session.recommendations.length,
        }
    }
}
