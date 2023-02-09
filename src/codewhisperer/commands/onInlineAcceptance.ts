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
import { Commands } from '../../shared/vscode/commands2'
import { isInlineCompletionEnabled } from '../util/commonUtil'
import { ExtContext } from '../../shared/extensions'
import { onAcceptance } from './onAcceptance'
import * as codewhispererClient from '../client/codewhisperer'
import {
    CodewhispererCompletionType,
    CodewhispererLanguage,
    CodewhispererTriggerType,
} from '../../shared/telemetry/telemetry.gen'
import { ReferenceLogViewProvider } from '../service/referenceLogViewProvider'
import { ReferenceHoverProvider } from '../service/referenceHoverProvider'

export const acceptSuggestion = Commands.declare(
    'aws.codeWhisperer.accept',
    (context: ExtContext) =>
        async (
            range: vscode.Range,
            acceptIndex: number,
            recommendation: string,
            requestId: string,
            sessionId: string,
            triggerType: CodewhispererTriggerType,
            completionType: CodewhispererCompletionType,
            language: CodewhispererLanguage,
            references: codewhispererClient.References
        ) => {
            const editor = vscode.window.activeTextEditor
            const onAcceptanceFunc = isInlineCompletionEnabled() ? onInlineAcceptance : onAcceptance
            await onAcceptanceFunc(
                {
                    editor,
                    range,
                    acceptIndex,
                    recommendation,
                    requestId,
                    sessionId,
                    triggerType,
                    completionType,
                    language,
                    references,
                },
                context.extensionContext.globalState
            ).finally(async () => {
                if (isInlineCompletionEnabled()) {
                    // at the end of recommendation acceptance, clear recommendations.
                    RecommendationHandler.instance.clearRecommendations()
                    await InlineCompletionService.instance.clearInlineCompletionStates(editor)
                }
            })
        }
)
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
        await sleep(CodeWhispererConstants.vsCodeCursorUpdateDelay)
        const languageContext = runtimeLanguageContext.getLanguageContext(acceptanceEntry.editor.document.languageId)
        const start = acceptanceEntry.range.start
        const end = acceptanceEntry.editor.selection.active
        const languageId = acceptanceEntry.editor.document.languageId
        RecommendationHandler.instance.reportUserDecisionOfRecommendation(
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
            // Do not handle extra bracket if there is a right context merge
            if (
                acceptanceEntry.recommendation ===
                RecommendationHandler.instance.recommendations[acceptanceEntry.acceptIndex].content
            ) {
                await handleExtraBrackets(acceptanceEntry.editor, acceptanceEntry.recommendation, end)
            }
        } catch (error) {
            getLogger().error(`${error} in handling right contexts`)
        }
        try {
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
        } finally {
            vsCodeState.isCodeWhispererEditing = false
        }

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
        if (acceptanceEntry.references !== undefined) {
            const referenceLog = ReferenceLogViewProvider.getReferenceLog(
                acceptanceEntry.recommendation,
                acceptanceEntry.references,
                acceptanceEntry.editor
            )
            ReferenceLogViewProvider.instance.addReferenceLog(referenceLog)
            ReferenceHoverProvider.instance.addCodeReferences(
                acceptanceEntry.recommendation,
                acceptanceEntry.references
            )
        }
    }
}
