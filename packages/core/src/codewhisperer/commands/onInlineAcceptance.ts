/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as CodeWhispererConstants from '../models/constants'
import { vsCodeState, OnRecommendationAcceptanceEntry } from '../models/model'
import { runtimeLanguageContext } from '../util/runtimeLanguageContext'
import { CodeWhispererTracker } from '../tracker/codewhispererTracker'
import { CodeWhispererCodeCoverageTracker } from '../tracker/codewhispererCodeCoverageTracker'
import { getLogger } from '../../shared/logger/logger'
import { RecommendationHandler } from '../service/recommendationHandler'
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
import { ImportAdderProvider } from '../service/importAdderProvider'
import { session } from '../util/codeWhispererSession'
import path from 'path'
import { RecommendationService } from '../service/recommendationService'
import { Container } from '../service/serviceContainer'

export const acceptSuggestion = Commands.declare(
    'aws.amazonq.accept',
    (context: ExtContext) =>
        async (
            range: vscode.Range,
            effectiveRange: vscode.Range,
            acceptIndex: number,
            recommendation: string,
            requestId: string,
            sessionId: string,
            triggerType: CodewhispererTriggerType,
            completionType: CodewhispererCompletionType,
            language: CodewhispererLanguage,
            references: codewhispererClient.References
        ) => {
            RecommendationService.instance.incrementAcceptedCount()
            const editor = vscode.window.activeTextEditor
            await Container.instance.lineAnnotationController.refresh(editor, 'codewhisperer')
            const onAcceptanceFunc = isInlineCompletionEnabled() ? onInlineAcceptance : onAcceptance
            await onAcceptanceFunc(
                {
                    editor,
                    range,
                    effectiveRange,
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
            )
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
    RecommendationHandler.instance.disposeInlineCompletion()

    if (acceptanceEntry.editor) {
        await sleep(CodeWhispererConstants.vsCodeCursorUpdateDelay)
        const languageContext = runtimeLanguageContext.getLanguageContext(
            acceptanceEntry.editor.document.languageId,
            path.extname(acceptanceEntry.editor.document.fileName)
        )
        const start = acceptanceEntry.range.start
        const end = acceptanceEntry.editor.selection.active

        vsCodeState.isCodeWhispererEditing = true
        /**
         * Mitigation to right context handling mainly for auto closing bracket use case
         */
        try {
            // Do not handle extra bracket if there is a right context merge
            if (acceptanceEntry.recommendation === session.recommendations[acceptanceEntry.acceptIndex].content) {
                await handleExtraBrackets(acceptanceEntry.editor, end, acceptanceEntry.effectiveRange.start)
            }
            await ImportAdderProvider.instance.onAcceptRecommendation(
                acceptanceEntry.editor,
                session.recommendations[acceptanceEntry.acceptIndex],
                start.line
            )
        } catch (error) {
            getLogger().error(`${error} in handling extra brackets or imports`)
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
        const insertedCoderange = new vscode.Range(start, end)
        CodeWhispererCodeCoverageTracker.getTracker(languageContext.language, globalStorage)?.countAcceptedTokens(
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

        RecommendationHandler.instance.reportUserDecisions(acceptanceEntry.acceptIndex)
    }
}
