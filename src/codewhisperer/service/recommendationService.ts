/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { ConfigurationEntry, GetRecommendationsResponse, vsCodeState } from '../models/model'
import { TelemetryHelper } from '../util/telemetryHelper'
import { isCloud9 } from '../../shared/extensionUtilities'
import { isInlineCompletionEnabled } from '../util/commonUtil'
import {
    CodewhispererAutomatedTriggerType,
    CodewhispererLanguage,
    CodewhispererTriggerType,
} from '../../shared/telemetry/telemetry'
import { AuthUtil } from '../util/authUtil'
import { isIamConnection } from '../../auth/connection'
import { RecommendationHandler } from '../service/recommendationHandler'
import { InlineCompletionService } from '../service/inlineCompletionService'
import { ClassifierTrigger } from './classifierTrigger'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
import { CodeWhispererSession } from '../util/codeWhispererSession'
import { runtimeLanguageContext } from '../util/runtimeLanguageContext'

export class RecommendationService {
    static #instance: RecommendationService

    private activeSession: CodeWhispererSession = new CodeWhispererSession('java', 'OnDemand')

    private sessionQueue: CodeWhispererSession[] = []

    public static get instance() {
        return (this.#instance ??= new RecommendationService())
    }

    public get session() {
        return this.activeSession
    }

    // visible for testing
    startSession(
        language: CodewhispererLanguage,
        triggerType: CodewhispererTriggerType,
        autoTriggerType?: CodewhispererAutomatedTriggerType
    ): CodeWhispererSession {
        const session = new CodeWhispererSession(language, triggerType, autoTriggerType)
        this.sessionQueue.push(session)
        return session
    }

    flushUserDecisions() {
        this.sessionQueue.forEach(session => {
            if (!session.isTelemetrySent && session.isRecommendationComplete) {
                RecommendationHandler.instance.reportUserDecisions(session)
            }
        })

        this.sessionQueue = this.sessionQueue.filter(session => !session.isTelemetrySent)
    }

    /** This method is assumed to be invoked first at the start of execution **/
    public setInvokeSuggestionStartTime(session: CodeWhispererSession) {
        TelemetryHelper.instance.resetClientComponentLatencyTime()
        session.invokeSuggestionStartTime = performance.now()
    }

    // this method is the entry point of any kind of generate recommendation action
    async generateRecommednation(
        client: DefaultCodeWhispererClient,
        editor: vscode.TextEditor,
        triggerType: CodewhispererTriggerType,
        config: ConfigurationEntry,
        autoTriggerType?: CodewhispererAutomatedTriggerType,
        event?: vscode.TextDocumentChangeEvent
    ) {
        const language = runtimeLanguageContext.normalizeLanguage(editor.document.languageId) ?? 'plaintext'
        if (!language) {
            // TODO: move show language not supported error message here early instead downstream callers
        }

        if (isCloud9('any')) {
            if (RecommendationHandler.instance.isGenerateRecommendationInProgress) {
                return
            }

            RecommendationHandler.instance.checkAndResetCancellationTokens()
            vsCodeState.isIntelliSenseActive = false
            RecommendationHandler.instance.isGenerateRecommendationInProgress = true

            let session: CodeWhispererSession = this.startSession(language, triggerType, autoTriggerType)
            try {
                let response: GetRecommendationsResponse = {
                    result: 'Failed',
                    errorMessage: undefined,
                }

                if (isCloud9('classic') || isIamConnection(AuthUtil.instance.conn)) {
                    await this.executeWhileSessionActive(session, () => {
                        return RecommendationHandler.instance.getRecommendations(
                            session,
                            client,
                            editor,
                            triggerType,
                            config,
                            autoTriggerType,
                            false
                        )
                    })
                } else {
                    if (AuthUtil.instance.isConnectionExpired()) {
                        await AuthUtil.instance.showReauthenticatePrompt()
                    }
                    await this.executeWhileSessionActive(session, () => {
                        return RecommendationHandler.instance.getRecommendations(
                            session,
                            client,
                            editor,
                            triggerType,
                            config,
                            autoTriggerType,
                            true
                        )
                    })
                }
                if (
                    RecommendationHandler.instance.canShowRecommendationInIntelliSense(editor, true, response, session)
                ) {
                    await vscode.commands.executeCommand('editor.action.triggerSuggest').then(() => {
                        vsCodeState.isIntelliSenseActive = true
                    })
                }
            } finally {
                RecommendationHandler.instance.isGenerateRecommendationInProgress = false
            }
        } else if (isInlineCompletionEnabled()) {
            const session = this.startSession(language, triggerType, autoTriggerType)
            this.setInvokeSuggestionStartTime(session)
            if (triggerType === 'OnDemand') {
                ClassifierTrigger.instance.recordClassifierResultForManualTrigger(editor)
            }

            this.executeWhileSessionActive(session, () => {
                return InlineCompletionService.instance.getPaginatedRecommendation(
                    session,
                    client,
                    editor,
                    triggerType,
                    config,
                    autoTriggerType,
                    event
                )
            })
        }
    }

    private async executeWhileSessionActive(
        session: CodeWhispererSession,
        runnable: () => Promise<GetRecommendationsResponse>
    ) {
        let response: GetRecommendationsResponse = {
            result: 'Failed',
            errorMessage: undefined,
        }

        try {
            response = await runnable()
            return response
        } catch (e) {
            response = { ...response, errorMessage: (e as Error).message }
        } finally {
            session.isRecommendationComplete = true
        }

        return response
    }
}
