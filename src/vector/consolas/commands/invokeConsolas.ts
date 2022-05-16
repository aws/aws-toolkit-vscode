/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as KeyStrokeHandler from '../service/keyStrokeHandler'
import { recommendations, invocationContext, automatedTriggerContext } from '../models/model'
import { resetIntelliSenseState } from '../util/globalStateUtil'
import { showTimedMessage } from '../../../shared/utilities/messages'
import { DefaultConsolasClient } from '../client/consolas'
import { showFirstRecommendation } from '../service/inlineCompletion'
import { isCloud9 } from '../../../shared/extensionUtilities'

export async function invokeConsolas(
    editor: vscode.TextEditor,
    client: DefaultConsolasClient,
    isShowMethodsOn: boolean,
    isManualTriggerEnabled: boolean,
    isAutomatedTriggerEnabled: boolean
) {
    /**
     * Show prompt when manual trigger is turned off
     */
    if (!isManualTriggerEnabled) {
        showTimedMessage('Consolas turned off', 2000)
        return
    }
    /**
     * For manual trigger, freeze incoming invocation if there's IN-PROGRESS invocation
     */
    if (invocationContext.isPendingResponse) {
        return
    }
    /**
     * IntelliSense in Cloud9 needs editor.suggest.showMethods
     */
    if (!isShowMethodsOn) {
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
        if (invocationContext.isIntelliSenseActive && editor.selection.active !== invocationContext.startPos) {
            resetIntelliSenseState(isManualTriggerEnabled, isAutomatedTriggerEnabled)
        }

        /**
         * Refresh recommendations response if there's no UNDECIDED/ACTIVE invocation, otherwise freeze incoming invocation
         */
        if (
            (!invocationContext.isIntelliSenseActive && isCloud9()) ||
            (!invocationContext.isConsolasEditing && !isCloud9())
        ) {
            recommendations.response = await KeyStrokeHandler.getRecommendations(
                client,
                editor,
                'OnDemand',
                isManualTriggerEnabled
            )
        }

        KeyStrokeHandler.checkPrefixMatchSuggestionAndUpdatePrefixMatchArray(
            !invocationContext.isIntelliSenseActive,
            editor
        )
        if (KeyStrokeHandler.isValidResponse(recommendations.response)) {
            automatedTriggerContext.keyStrokeCount = 0
            if (isCloud9()) {
                vscode.commands.executeCommand('editor.action.triggerSuggest').then(() => {
                    invocationContext.isIntelliSenseActive = true
                })
            } else {
                await showFirstRecommendation(editor)
            }
        } else {
            showTimedMessage('No suggestions from Consolas', 2000)
        }
    }
}
