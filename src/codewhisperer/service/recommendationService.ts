/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { ConfigurationEntry, GetRecommendationsResponse, vsCodeState } from '../models/model'
import { TelemetryHelper } from '../util/telemetryHelper'
import { isCloud9 } from '../../shared/extensionUtilities'
import { isInlineCompletionEnabled } from '../util/commonUtil'
import { CodewhispererAutomatedTriggerType, CodewhispererTriggerType } from '../../shared/telemetry/telemetry'
import { AuthUtil } from '../util/authUtil'
import { isIamConnection } from '../../auth/connection'
import { RecommendationHandler } from '../service/recommendationHandler'
import { InlineCompletionService } from '../service/inlineCompletionService'
import { ClassifierTrigger } from './classifierTrigger'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
import { CodeWhispererSession } from '../util/codeWhispererSession'

export class RecommendationService {
    static #instance: RecommendationService

    private activeSession: CodeWhispererSession = new CodeWhispererSession()
    private sessionQueue: CodeWhispererSession[] = []

    public static get instance() {
        return (this.#instance ??= new RecommendationService())
    }

    public get session() {
        return this.activeSession
    }

    startSession(): CodeWhispererSession {
        const session = new CodeWhispererSession()
        this.sessionQueue.push(session)
        return session
    }

    flushUserDecisions() {
        this.sessionQueue.forEach(session => {
            if (!session.isJobDone) {
                RecommendationHandler.instance.reportUserDecisions(session)
            }
        })

        this.sessionQueue = this.sessionQueue.filter(session => !session.isJobDone)
    }

    async generateRecommednation(
        client: DefaultCodeWhispererClient,
        editor: vscode.TextEditor,
        triggerType: CodewhispererTriggerType,
        config: ConfigurationEntry,
        autoTriggerType?: CodewhispererAutomatedTriggerType,
        event?: vscode.TextDocumentChangeEvent
    ) {
        if (isCloud9('any')) {
            if (RecommendationHandler.instance.isGenerateRecommendationInProgress) {
                return
            }

            RecommendationHandler.instance.checkAndResetCancellationTokens()
            vsCodeState.isIntelliSenseActive = false
            RecommendationHandler.instance.isGenerateRecommendationInProgress = true

            try {
                let response: GetRecommendationsResponse = {
                    result: 'Failed',
                    errorMessage: undefined,
                }

                const session = this.startSession()
                if (isCloud9('classic') || isIamConnection(AuthUtil.instance.conn)) {
                    response = await RecommendationHandler.instance.getRecommendations(
                        session,
                        client,
                        editor,
                        triggerType,
                        config,
                        autoTriggerType,
                        false
                    )
                } else {
                    if (AuthUtil.instance.isConnectionExpired()) {
                        await AuthUtil.instance.showReauthenticatePrompt()
                    }
                    response = await RecommendationHandler.instance.getRecommendations(
                        session,
                        client,
                        editor,
                        triggerType,
                        config,
                        autoTriggerType,
                        true
                    )
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
            TelemetryHelper.instance.setInvokeSuggestionStartTime()
            if (triggerType === 'OnDemand') {
                ClassifierTrigger.instance.recordClassifierResultForManualTrigger(editor)
            }
            await InlineCompletionService.instance.getPaginatedRecommendation(
                this.startSession(),
                client,
                editor,
                triggerType,
                config,
                autoTriggerType,
                event
            )
        }
    }
}
