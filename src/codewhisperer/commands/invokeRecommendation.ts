/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { vsCodeState, ConfigurationEntry } from '../models/model'
import { resetIntelliSenseState } from '../util/globalStateUtil'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
import { InlineCompletion } from '../service/inlineCompletion'
import { isCloud9 } from '../../shared/extensionUtilities'
import { RecommendationHandler } from '../service/recommendationHandler'
import { isInlineCompletionEnabled } from '../util/commonUtil'
import { InlineCompletionService } from '../service/inlineCompletionService'
import { AuthUtil } from '../util/authUtil'
import { TelemetryHelper } from '../util/telemetryHelper'

/**
 * This function is for manual trigger CodeWhisperer
 */

export async function invokeRecommendation(
    editor: vscode.TextEditor,
    client: DefaultCodeWhispererClient,
    config: ConfigurationEntry
) {
    if (!config.isManualTriggerEnabled) {
        return
    }
    /**
     * IntelliSense in Cloud9 needs editor.suggest.showMethods
     */
    if (!config.isShowMethodsEnabled && isCloud9()) {
        vscode.window.showWarningMessage('Turn on "editor.suggest.showMethods" to use CodeWhisperer')
        return
    }
    if (editor) {
        /**
         * Skip when output channel gains focus and invoke
         */
        if (editor.document.languageId === 'Log') {
            return
        }
        /**
         * When using intelliSense, if invocation position changed, reject previous active recommendations
         */
        if (vsCodeState.isIntelliSenseActive && editor.selection.active !== RecommendationHandler.instance.startPos) {
            resetIntelliSenseState(
                config.isManualTriggerEnabled,
                config.isAutomatedTriggerEnabled,
                RecommendationHandler.instance.isValidResponse()
            )
        }
        if (isCloud9()) {
            if (RecommendationHandler.instance.isGenerateRecommendationInProgress) {
                return
            }
            vsCodeState.isIntelliSenseActive = false
            RecommendationHandler.instance.isGenerateRecommendationInProgress = true
            try {
                RecommendationHandler.instance.reportUserDecisionOfRecommendation(editor, -1)
                RecommendationHandler.instance.clearRecommendations()
                await RecommendationHandler.instance.getRecommendations(
                    client,
                    editor,
                    'OnDemand',
                    config,
                    undefined,
                    false
                )
                if (RecommendationHandler.instance.canShowRecommendationInIntelliSense(editor, true)) {
                    await vscode.commands.executeCommand('editor.action.triggerSuggest').then(() => {
                        vsCodeState.isIntelliSenseActive = true
                    })
                }
            } finally {
                RecommendationHandler.instance.isGenerateRecommendationInProgress = false
            }
        } else if (isInlineCompletionEnabled()) {
            if (AuthUtil.instance.isConnectionExpired()) {
                await AuthUtil.instance.showReauthenticatePrompt()
            }
            TelemetryHelper.instance.setInvokeSuggestionStartTime()
            await InlineCompletionService.instance.getPaginatedRecommendation(client, editor, 'OnDemand', config)
        } else {
            if (
                !vsCodeState.isCodeWhispererEditing &&
                !InlineCompletion.instance.isPaginationRunning() &&
                !InlineCompletion.instance.getIsActive
            ) {
                await InlineCompletion.instance.resetInlineStates(editor)
                InlineCompletion.instance.setCodeWhispererStatusBarLoading()
                InlineCompletion.instance.getPaginatedRecommendation(client, editor, 'OnDemand', config)
            }
        }
    }
}
