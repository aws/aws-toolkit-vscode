/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as KeyStrokeHandler from '../service/keyStrokeHandler'
import { recommendations, invocationContext, automatedTriggerContext } from '../models/model'
import { onRejection } from './onRejection'
import { showTimedMessage } from '../../../shared/utilities/messages'
import { DefaultConsolasClient } from '../client/consolas'
import { showFirstRecommendation } from '../views/recommendationSelectionProvider'

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
        showTimedMessage('Consolas (Manual Trigger) turned off', 2000)
        return
    }
    /**
     * Freeze incoming invocation if there's IN-PROGRESS invocation
     */
    if (invocationContext.isPendingResponse) {
        return
    }
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
         * If invocation position changed, reject previous active recommendations
         */
        if (invocationContext.isActive && editor.selection.active !== invocationContext.startPos) {
            await onRejection(isManualTriggerEnabled, isAutomatedTriggerEnabled)
        }

        /**
         * Refresh recommendations response if there's no UNDECIDED/ACTIVE invocation, otherwise freeze incoming invocation
         */
        if (!invocationContext.isActive) {
            recommendations.response = await KeyStrokeHandler.getRecommendations(
                client,
                editor,
                'OnDemand',
                isManualTriggerEnabled
            )
        }

        KeyStrokeHandler.checkPrefixMatchSuggestionAndUpdatePrefixMatchArray(!invocationContext.isActive, editor)
        if (KeyStrokeHandler.isValidResponse(recommendations.response)) {
            automatedTriggerContext.keyStrokeCount = 0
            await showFirstRecommendation(editor)
        } else {
            showTimedMessage('No suggestions from Consolas', 2000)
        }
    }
}
