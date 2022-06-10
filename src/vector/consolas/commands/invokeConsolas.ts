/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { vsCodeState, ConfigurationEntry } from '../models/model'
import { resetIntelliSenseState } from '../util/globalStateUtil'
import { showTimedMessage } from '../../../shared/utilities/messages'
import { DefaultConsolasClient } from '../client/consolas'
import { InlineCompletion } from '../service/inlineCompletion'
import { isCloud9 } from '../../../shared/extensionUtilities'
import { RecommendationHandler } from '../service/recommendationHandler'
import { KeyStrokeHandler } from '../service/keyStrokeHandler'

/**
 * This function is for manual trigger Consolas
 */

export async function invokeConsolas(
    editor: vscode.TextEditor,
    client: DefaultConsolasClient,
    config: ConfigurationEntry
) {
    /**
     * Show prompt when manual trigger is turned off
     */
    if (!config.isManualTriggerEnabled) {
        showTimedMessage('Consolas turned off', 2000)
        return
    }
    /**
     * IntelliSense in Cloud9 needs editor.suggest.showMethods
     */
    if (!config.isShowMethodsEnabled) {
        vscode.window.showWarningMessage('Turn on "editor.suggest.showMethods" to use Consolas')
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
        KeyStrokeHandler.instance.keyStrokeCount = 0
        if (isCloud9()) {
            if (!vsCodeState.isIntelliSenseActive) {
                RecommendationHandler.instance.clearRecommendations()
                await RecommendationHandler.instance.getRecommendations(
                    client,
                    editor,
                    'OnDemand',
                    config,
                    undefined,
                    false
                )
                if (RecommendationHandler.instance.isValidResponse()) {
                    vscode.commands.executeCommand('editor.action.triggerSuggest').then(() => {
                        vsCodeState.isIntelliSenseActive = true
                    })
                } else {
                    if (RecommendationHandler.instance.errorMessagePrompt !== '') {
                        showTimedMessage(RecommendationHandler.instance.errorMessagePrompt, 2000)
                    } else {
                        showTimedMessage('No suggestions from Consolas', 2000)
                    }
                }
            }
        } else {
            if (
                !vsCodeState.isConsolasEditing &&
                !InlineCompletion.instance.isPaginationRunning() &&
                !InlineCompletion.instance.getIsActive
            ) {
                await InlineCompletion.instance.resetInlineStates(editor)
                InlineCompletion.instance.setConsolasStatusBarLoading()
                InlineCompletion.instance.getPaginatedRecommendation(client, editor, 'OnDemand', config)
            }
        }
    }
}
