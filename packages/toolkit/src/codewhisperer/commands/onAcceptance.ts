/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { vsCodeState, OnRecommendationAcceptanceEntry } from '../models/model'
import { runtimeLanguageContext } from '../util/runtimeLanguageContext'
import { CodeWhispererTracker } from '../tracker/codewhispererTracker'
import { CodeWhispererCodeCoverageTracker } from '../tracker/codewhispererCodeCoverageTracker'
import { getLogger } from '../../shared/logger/logger'
import { isCloud9 } from '../../shared/extensionUtilities'
import { handleExtraBrackets } from '../util/closingBracketUtil'
import { RecommendationHandler } from '../service/recommendationHandler'
import { ReferenceLogViewProvider } from '../service/referenceLogViewProvider'
import { ReferenceHoverProvider } from '../service/referenceHoverProvider'
import path from 'path'

/**
 * This function is called when user accepts a intelliSense suggestion or an inline suggestion
 */
export async function onAcceptance(acceptanceEntry: OnRecommendationAcceptanceEntry, globalStorage: vscode.Memento) {
    RecommendationHandler.instance.cancelPaginatedRequest()
    /**
     * Format document
     */
    if (acceptanceEntry.editor) {
        const languageContext = runtimeLanguageContext.getLanguageContext(
            acceptanceEntry.editor.document.languageId,
            path.extname(acceptanceEntry.editor.document.fileName)
        )
        const start = acceptanceEntry.range.start
        const end = isCloud9() ? acceptanceEntry.editor.selection.active : acceptanceEntry.range.end

        // codewhisperer will be doing editing while formatting.
        // formatting should not trigger consoals auto trigger
        vsCodeState.isCodeWhispererEditing = true
        /**
         * Mitigation to right context handling mainly for auto closing bracket use case
         */
        try {
            await handleExtraBrackets(acceptanceEntry.editor, end, start)
        } catch (error) {
            getLogger().error(`${error} in handleAutoClosingBrackets`)
        }
        // move cursor to end of suggestion before doing code format
        // after formatting, the end position will still be editor.selection.active
        if (!isCloud9()) {
            acceptanceEntry.editor.selection = new vscode.Selection(end, end)
        }

        if (isCloud9()) {
            vsCodeState.isIntelliSenseActive = false
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
        const insertedCoderange = new vscode.Range(start, end)
        CodeWhispererCodeCoverageTracker.getTracker(languageContext.language)?.countAcceptedTokens(
            insertedCoderange,
            acceptanceEntry.editor.document.getText(insertedCoderange),
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

    // at the end of recommendation acceptance, report user decisions and clear recommendations.
    RecommendationHandler.instance.reportUserDecisions(acceptanceEntry.acceptIndex)
}
