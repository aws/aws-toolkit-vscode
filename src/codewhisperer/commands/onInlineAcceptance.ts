/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as CodeWhispererConstants from '../models/constants'
import { vsCodeState, OnRecommendationAcceptanceEntry } from '../models/model'
import { runtimeLanguageContext } from '../util/runtimeLanguageContext'
import { CodeWhispererTracker } from '../tracker/codewhispererTracker'
import { CodeWhispererCodeCoverageTracker } from '../tracker/codewhispererCodeCoverageTracker'
import { TextEdit, WorkspaceEdit, workspace } from 'vscode'
import { getTabSizeSetting } from '../../shared/utilities/editorUtilities'
import { getLogger } from '../../shared/logger/logger'
import { RecommendationHandler } from '../service/recommendationHandler'
import { InlineCompletionService } from '../service/inlineCompletionService'
import { sleep } from '../../shared/utilities/timeoutUtils'
import { handleExtraBrackets } from '../util/closingBracketUtil'

/**
 * This function is called when user accepts a intelliSense suggestion or an inline suggestion
 */
export async function onInlineAcceptance(
    acceptanceEntry: OnRecommendationAcceptanceEntry,
    globalStorage: vscode.Memento
) {
    RecommendationHandler.instance.cancelPaginatedRequest()
    InlineCompletionService.instance.disposeInlineCompletion()

    if (acceptanceEntry.editor) {
        sleep(CodeWhispererConstants.vsCodeCursorUpdateDelay)
        const languageContext = runtimeLanguageContext.getLanguageContext(acceptanceEntry.editor.document.languageId)
        const start = acceptanceEntry.range.start
        const end = acceptanceEntry.editor.selection.active
        const languageId = acceptanceEntry.editor.document.languageId
        RecommendationHandler.instance.reportUserDecisionOfCurrentRecommendation(
            acceptanceEntry.editor,
            acceptanceEntry.acceptIndex
        )
        // codewhisperer will be doing editing while formatting.
        // formatting should not trigger consoals auto trigger
        vsCodeState.isCodeWhispererEditing = true
        /**
         * Mitigation to right context handling mainly for auto closing bracket use case
         */
        try {
            await restoreRightContext(acceptanceEntry.editor)
            await handleExtraBrackets(acceptanceEntry.editor, acceptanceEntry.recommendation, end)
        } catch (error) {
            getLogger().error(`${error} in handling right contexts`)
        }
        if (languageId === CodeWhispererConstants.python) {
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
        vsCodeState.isCodeWhispererEditing = false
        CodeWhispererTracker.getTracker().enqueue({
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
        const codeRangeAfterFormat = new vscode.Range(start, acceptanceEntry.editor.selection.active)
        CodeWhispererCodeCoverageTracker.getTracker(languageContext.language, globalStorage)?.countAcceptedTokens(
            codeRangeAfterFormat,
            acceptanceEntry.editor.document.getText(codeRangeAfterFormat),
            acceptanceEntry.editor.document.fileName
        )
    }

    // at the end of recommendation acceptance, clear recommendations.
    await InlineCompletionService.instance.clearInlineCompletionStates(acceptanceEntry.editor)
}

// Restore right context
// to handle extra auto closing bracket/quote that were added in native inline completion typeahead
async function restoreRightContext(editor: vscode.TextEditor) {
    const rightContextWhenInvoke = RecommendationHandler.instance.invocationLineRightContext
    const pos = editor.selection.active
    const newRightRange = new vscode.Range(pos, editor.document.lineAt(pos).range.end)
    const rightContextWhenAccept = editor.document.getText(newRightRange)
    // replace with invocation right context
    if (rightContextWhenInvoke !== undefined && rightContextWhenAccept !== rightContextWhenInvoke) {
        await editor.edit(
            editBuilder => {
                editBuilder.replace(newRightRange, rightContextWhenInvoke)
            },
            { undoStopAfter: false, undoStopBefore: false }
        )
    }
}
