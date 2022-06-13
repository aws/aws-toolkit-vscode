/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ConsolasConstants } from '../models/constants'
import { vsCodeState, OnRecommendationAcceptanceEntry } from '../models/model'
import { runtimeLanguageContext } from '../../../vector/consolas/util/runtimeLanguageContext'
import { ConsolasTracker } from '../tracker/consolasTracker'
import { ConsolasCodeCoverageTracker } from '../tracker/consolasCodeCoverageTracker'
import { TextEdit, WorkspaceEdit, workspace } from 'vscode'
import { getTabSizeSetting } from '../../../shared/utilities/editorUtilities'
import { getLogger } from '../../../shared/logger/logger'
import { isCloud9 } from '../../../shared/extensionUtilities'
import { handleAutoClosingBrackets } from '../util/closingBracketUtil'
import { RecommendationHandler } from '../service/recommendationHandler'
import { InlineCompletion } from '../service/inlineCompletion'
import { KeyStrokeHandler } from '../service/keyStrokeHandler'

/**
 * This function is called when user accepts a intelliSense suggestion or an inline suggestion
 */
export async function onAcceptance(
    acceptanceEntry: OnRecommendationAcceptanceEntry,
    isAutoClosingBracketsEnabled: boolean,
    globalStorage: vscode.Memento
) {
    RecommendationHandler.instance.cancelPaginatedRequest()
    /**
     * Format document
     */
    if (acceptanceEntry.editor) {
        const languageContext = runtimeLanguageContext.getLanguageContext(acceptanceEntry.editor.document.languageId)
        const start = acceptanceEntry.range.start
        const end = isCloud9() ? acceptanceEntry.editor.selection.active : acceptanceEntry.range.end
        const languageId = acceptanceEntry.editor.document.languageId
        RecommendationHandler.instance.reportUserDecisionOfCurrentRecommendation(
            acceptanceEntry.editor,
            acceptanceEntry.acceptIndex
        )
        // consolas will be doing editing while formatting.
        // formatting should not trigger consoals auto trigger
        vsCodeState.isConsolasEditing = true
        /**
         * Mitigation to right context handling mainly for auto closing bracket use case
         */
        if (isAutoClosingBracketsEnabled && !InlineCompletion.instance.isTypeaheadInProgress) {
            try {
                await handleAutoClosingBrackets(
                    acceptanceEntry.triggerType,
                    acceptanceEntry.editor,
                    acceptanceEntry.recommendation,
                    end.line,
                    KeyStrokeHandler.instance.specialChar
                )
            } catch (error) {
                getLogger().error(`${error} in handleAutoClosingBrackets`)
            }
        }
        // move cursor to end of suggestion before doing code format
        // after formatting, the end position will still be editor.selection.active
        if (!isCloud9()) {
            acceptanceEntry.editor.selection = new vscode.Selection(end, end)
        }

        /**
         * Python formatting uses Black but Black does not support the "Format Selection" command,
         * instead we use document format here. For other languages, we use "Format Selection"
         */
        if (languageId === ConsolasConstants.python) {
            await vscode.commands.executeCommand('editor.action.format')
        } else {
            const range = new vscode.Range(start, end)
            const edits: TextEdit[] | undefined = await vscode.commands.executeCommand(
                'vscode.executeFormatRangeProvider',
                acceptanceEntry.editor.document.uri,
                range,
                {
                    tabSize: getTabSizeSetting(),
                    insertSpaces: true,
                }
            )
            if (edits && acceptanceEntry.editor) {
                const wEdit = new WorkspaceEdit()
                wEdit.set(acceptanceEntry.editor.document.uri, edits)
                await workspace.applyEdit(wEdit)
            }
        }
        /* After formatting, update global variable states.
         */

        if (isCloud9()) {
            vsCodeState.isIntelliSenseActive = false
        } else {
            InlineCompletion.instance.isTypeaheadInProgress = false
        }
        vsCodeState.isConsolasEditing = false
        ConsolasTracker.getTracker().enqueue({
            time: new Date(),
            fileUrl: acceptanceEntry.editor.document.uri,
            originalString: acceptanceEntry.editor.document.getText(new vscode.Range(start, end)),
            startPosition: start,
            endPosition: end,
            requestId: acceptanceEntry.requestId,
            sessionId: acceptanceEntry.sessionId,
            index: acceptanceEntry.acceptIndex,
            triggerType: acceptanceEntry.triggerType,
            completionType: acceptanceEntry.completionType,
            language: languageContext.language,
        })
        ConsolasCodeCoverageTracker.getTracker(languageContext.language, globalStorage).setAcceptedTokens(
            acceptanceEntry.recommendation
        )
    }

    // at the end of recommendation acceptance, clear recommendations.
    RecommendationHandler.instance.clearRecommendations()
}
