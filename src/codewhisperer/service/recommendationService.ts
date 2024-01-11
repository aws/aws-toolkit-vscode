/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { ConfigurationEntry, GetRecommendationsResponse, vsCodeState } from '../models/model'
import { isCloud9 } from '../../shared/extensionUtilities'
import { isInlineCompletionEnabled } from '../util/commonUtil'
import { CodewhispererAutomatedTriggerType, CodewhispererTriggerType } from '../../shared/telemetry/telemetry'
import { AuthUtil } from '../util/authUtil'
import { isIamConnection } from '../../auth/connection'
import { RecommendationHandler } from '../service/recommendationHandler'
import { InlineCompletionService } from '../service/inlineCompletionService'
import { ClassifierTrigger } from './classifierTrigger'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'

export class RecommendationService {
    static #instance: RecommendationService

    public static get instance() {
        return (this.#instance ??= new RecommendationService())
    }

    async generateRecommendation(
        client: DefaultCodeWhispererClient,
        editor: vscode.TextEditor,
        triggerType: CodewhispererTriggerType,
        config: ConfigurationEntry,
        autoTriggerType?: CodewhispererAutomatedTriggerType,
        event?: vscode.TextDocumentChangeEvent
    ) {
        if (isCloud9('any')) {
            // C9 manual trigger key alt/option + C is ALWAYS enabled because the VSC version C9 is on doesn't support setContextKey which is used for CODEWHISPERER_ENABLED
            // therefore we need a connection check if there is ANY connection(regardless of the connection's state) connected to CodeWhisperer on C9
            if (triggerType === 'OnDemand' && !AuthUtil.instance.isConnected()) {
                return
            }

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

                if (isCloud9('classic') || isIamConnection(AuthUtil.instance.conn)) {
                    response = await RecommendationHandler.instance.getRecommendations(
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
                        client,
                        editor,
                        triggerType,
                        config,
                        autoTriggerType,
                        true
                    )
                }
                if (RecommendationHandler.instance.canShowRecommendationInIntelliSense(editor, true, response)) {
                    await vscode.commands.executeCommand('editor.action.triggerSuggest').then(() => {
                        vsCodeState.isIntelliSenseActive = true
                    })
                }
            } finally {
                RecommendationHandler.instance.isGenerateRecommendationInProgress = false
            }
        } else if (isInlineCompletionEnabled()) {
            if (triggerType === 'OnDemand') {
                ClassifierTrigger.instance.recordClassifierResultForManualTrigger(editor)
            }
            await InlineCompletionService.instance.getPaginatedRecommendation(
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
