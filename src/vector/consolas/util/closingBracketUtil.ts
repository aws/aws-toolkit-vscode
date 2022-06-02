/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as telemetry from '../../../shared/telemetry/telemetry'

export async function handleAutoClosingBrackets(
    triggerType: telemetry.ConsolasTriggerType,
    editor: vscode.TextEditor,
    recommendation: string,
    line: number,
    specialChar: string
) {
    const openingBrackets = new Map<string, string>()
    openingBrackets.set('{', '}')
    openingBrackets.set('(', ')')
    openingBrackets.set('[', ']')
    const closingBracket = openingBrackets.get(specialChar)
    if (
        triggerType === 'AutoTrigger' &&
        closingBracket !== undefined &&
        hasExtraClosingBracket(recommendation, specialChar, closingBracket)
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
