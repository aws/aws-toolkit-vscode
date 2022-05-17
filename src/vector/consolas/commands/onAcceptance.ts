/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ConsolasConstants } from '../models/constants'
import {
    recommendations,
    invocationContext,
    OnRecommendationAcceptanceEntry,
    automatedTriggerContext,
} from '../models/model'
import { runtimeLanguageContext } from '../../../vector/consolas/util/runtimeLanguageContext'
import * as telemetry from '../../../shared/telemetry/telemetry'
import { TelemetryHelper } from '../util/telemetryHelper'
import { ConsolasTracker } from '../tracker/consolasTracker'
import { ConsolasCodeCoverageTracker } from '../tracker/consolasCodeCoverageTracker'
import { TextEdit, WorkspaceEdit, workspace } from 'vscode'
import { getTabSizeSetting } from '../../../shared/utilities/editorUtilities'
import { getLogger } from '../../../shared/logger/logger'
import { isCloud9 } from '../../../shared/extensionUtilities'

/**
 * This function is called when user accepts a intelliSense suggestion or an inline suggestion
 */
export async function onAcceptance(
    acceptanceEntry: OnRecommendationAcceptanceEntry,
    isAutoClosingBracketsEnabled: boolean,
    globalStorage: vscode.Memento
) {
    /**
     * Format document
     */
    if (acceptanceEntry.editor) {
        const languageContext = runtimeLanguageContext.getLanguageContext(acceptanceEntry.editor.document.languageId)
        const start = acceptanceEntry.range.start
        const end = isCloud9() ? acceptanceEntry.editor.selection.active : acceptanceEntry.range.end
        const languageId = acceptanceEntry.editor.document.languageId
        TelemetryHelper.recordUserDecisionTelemetry(
            acceptanceEntry.acceptIndex,
            acceptanceEntry.editor?.document.languageId
        )
        // consolas will be doing editing while formatting.
        // formatting should not trigger consoals auto trigger
        invocationContext.isConsolasEditing = true
        /**
         * Mitigation to right context handling mainly for auto closing bracket use case
         */
        if (isAutoClosingBracketsEnabled && !invocationContext.isTypeaheadInProgress) {
            try {
                await handleAutoClosingBrackets(
                    acceptanceEntry.triggerType,
                    acceptanceEntry.editor,
                    acceptanceEntry.recommendation,
                    end.line
                )
            } catch (error) {
                getLogger().error(`${error} in handleAutoClosingBrackets`)
            }
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
        /* After formatting, move the current active cursor position
         *  and update global variable states.
         */
        if (isCloud9()) {
            if (acceptanceEntry.editor) {
                acceptanceEntry.editor.selection = new vscode.Selection(
                    acceptanceEntry.editor.selection.active,
                    acceptanceEntry.editor.selection.active
                )
            }
            invocationContext.isIntelliSenseActive = false
        } else {
            if (acceptanceEntry.editor) {
                acceptanceEntry.editor.selection = new vscode.Selection(end, end)
            }
        }
        invocationContext.isConsolasEditing = false
        invocationContext.isTypeaheadInProgress = false
        ConsolasTracker.getTracker().enqueue({
            time: new Date(),
            fileUrl: acceptanceEntry.editor.document.uri,
            originalString: acceptanceEntry.editor.document.getText(new vscode.Range(start, end)),
            startPosition: start,
            endPosition: end,
            requestId: acceptanceEntry.requestId,
            index: acceptanceEntry.acceptIndex,
            triggerType: acceptanceEntry.triggerType,
            completionType: acceptanceEntry.completionType,
            language: languageContext.language,
            languageRuntime: languageContext.runtimeLanguage,
            languageRuntimeSource: languageContext.runtimeLanguageSource,
        })
        ConsolasCodeCoverageTracker.getTracker(languageContext.language, globalStorage).setAcceptedTokens(
            acceptanceEntry.recommendation
        )
    }
    recommendations.requestId = ''
}

export async function handleAutoClosingBrackets(
    triggerType: telemetry.ConsolasTriggerType,
    editor: vscode.TextEditor,
    recommendation: string,
    line: number
) {
    const openingBrackets = new Map<string, string>()
    openingBrackets.set('{', '}')
    openingBrackets.set('(', ')')
    openingBrackets.set('[', ']')
    const closingBracket = openingBrackets.get(automatedTriggerContext.specialChar)
    if (
        triggerType === 'AutoTrigger' &&
        closingBracket !== undefined &&
        hasExtraClosingBracket(recommendation, automatedTriggerContext.specialChar, closingBracket)
    ) {
        let curLine = line
        let textLine = editor.document.lineAt(curLine).text
        while (curLine >= 0 && !textLine.includes(closingBracket)) {
            curLine--
            textLine = editor.document.lineAt(curLine).text
        }
        if (curLine >= 0) {
            await editor.edit(
                editBuilder => {
                    const pos = textLine.lastIndexOf(closingBracket)
                    editBuilder.delete(new vscode.Range(curLine, pos, curLine, pos + 1))
                },
                { undoStopAfter: false, undoStopBefore: false }
            )
        }
    }
}

export function hasExtraClosingBracket(
    recommendation: string,
    openingBracket: string,
    closingBracket: string
): boolean {
    let count = 0
    let pos = recommendation.indexOf(closingBracket)
    while (pos > 0) {
        count++
        pos = recommendation.indexOf(closingBracket, pos + 1)
    }
    pos = recommendation.indexOf(openingBracket)
    while (pos > 0) {
        count--
        pos = recommendation.indexOf(openingBracket, pos + 1)
    }
    return count === 1
}
