/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { vsCodeState, ConfigurationEntry, GetRecommendationsResponse } from '../models/model'
import { resetIntelliSenseState } from '../util/globalStateUtil'
import { DefaultCodeWhispererClient } from '../client/codewhisperer'
import { isCloud9 } from '../../shared/extensionUtilities'
import { RecommendationHandler } from '../service/recommendationHandler'
import { isInlineCompletionEnabled } from '../util/commonUtil'
import { InlineCompletionService } from '../service/inlineCompletionService'
import { AuthUtil } from '../util/authUtil'
import { TelemetryHelper } from '../util/telemetryHelper'
import { ClassifierTrigger } from '../service/classifierTrigger'
import { isIamConnection } from '../../auth/connection'
import { session } from '../util/codeWhispererSession'

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
    if (!editor) {
        return
    }

    /**
     * Skip when output channel gains focus and invoke
     */
    if (editor.document.languageId === 'Log') {
        return
    }
    /**
     * When using intelliSense, if invocation position changed, reject previous active recommendations
     */
    if (vsCodeState.isIntelliSenseActive && editor.selection.active !== session.startPos) {
        resetIntelliSenseState(
            config.isManualTriggerEnabled,
            config.isAutomatedTriggerEnabled,
            RecommendationHandler.instance.isValidResponse()
        )
    }

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
            if (isCloud9('classic') || isIamConnection(AuthUtil.instance.conn)) {
                response = await RecommendationHandler.instance.getRecommendations(
                    client,
                    editor,
                    'OnDemand',
                    config,
                    undefined,
                    false
                )
            } else {
                if (AuthUtil.instance.isConnectionExpired()) {
                    await AuthUtil.instance.showReauthenticatePrompt()
                }
                response = await RecommendationHandler.instance.getRecommendations(
                    client,
                    editor,
                    'OnDemand',
                    config,
                    undefined,
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
        TelemetryHelper.instance.setInvokeSuggestionStartTime()
        ClassifierTrigger.instance.recordClassifierResultForManualTrigger(editor)
        await InlineCompletionService.instance.getPaginatedRecommendation(client, editor, 'OnDemand', config)
    }
}
