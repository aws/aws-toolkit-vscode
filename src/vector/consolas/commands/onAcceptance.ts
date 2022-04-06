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

export async function onAcceptance(
    acceptanceEntry: OnRecommendationAcceptanceEntry,
    isAutoClosingBracketsEnabled: boolean
) {
    /**
     * Format document
     */
    if (acceptanceEntry.editor) {
        const start = acceptanceEntry.editor.document.lineAt(acceptanceEntry.line).range.start
        const end = acceptanceEntry.editor.selection.active
        const languageId = acceptanceEntry.editor.document.languageId
        /**
         * Mitigation to right context handling mainly for auto closing bracket use case
         */
        if (isAutoClosingBracketsEnabled) {
            await handleAutoClosingBrackets(
                acceptanceEntry.triggerType,
                acceptanceEntry.editor,
                acceptanceEntry.recommendation,
                end.line
            )
        }
        /**
         * Python formatting uses Black but Black does not support the "Format Selection" command,
         * instead we use document format here. For other languages, we use "Format Selection"
         */
        if (languageId === ConsolasConstants.PYTHON) {
            vscode.commands.executeCommand('editor.action.format').then(() => {
                invocationContext.isActive = false
            })
        } else {
            acceptanceEntry.editor.selection = new vscode.Selection(start, end)
            vscode.commands.executeCommand('editor.action.formatSelection').then(() => {
                if (acceptanceEntry.editor) {
                    acceptanceEntry.editor.selection = new vscode.Selection(end, end)
                }
                invocationContext.isActive = false
            })
        }
        const languageContext = runtimeLanguageContext.getLanguageContext(languageId)
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
    }
    TelemetryHelper.recordUserDecisionTelemetry(
        acceptanceEntry.acceptIndex,
        acceptanceEntry.editor?.document.languageId
    )

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
