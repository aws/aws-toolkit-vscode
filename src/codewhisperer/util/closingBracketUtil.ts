/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { workspace, WorkspaceEdit } from 'vscode'
import { isCloud9 } from '../../shared/extensionUtilities'
import * as CodeWhispererConstants from '../models/constants'

interface bracketMapType {
    [k: string]: string
}

const bracketMap: bracketMapType = {
    ')': '(',
    ']': '[',
    '}': '{',
}

export const calculateBracketsLevel = (code: string, isRightContext: boolean = false) => {
    const bracketCounts: Map<string, number> = new Map([
        ['(', 0],
        ['[', 0],
        ['{', 0],
    ])
    const bracketsIndexLevel = []

    for (let i = 0; i < code.length; i++) {
        const char = code[i]
        if (bracketCounts.has(char)) {
            const count = bracketCounts.get(char) || 0
            const newCount = count + 1
            bracketCounts.set(char, newCount)
            bracketsIndexLevel.push({
                char,
                count: newCount,
                idx: i,
            })
        } else if (char in bracketMap) {
            const correspondingBracket = bracketMap[char as keyof bracketMapType]
            const count = bracketCounts.get(correspondingBracket) || 0
            const newCount = count === 0 ? 0 : count - 1
            bracketCounts.set(bracketMap[char], newCount)
            bracketsIndexLevel.push({
                char: correspondingBracket,
                count: newCount,
                idx: i,
            })
        } else if (isRightContext && !(char in bracketMap) && !bracketCounts.has(char) && !/\s/.test(char)) {
            // we can stop processing right context when we encounter a char that is not a bracket nor white space
            break
        }
    }
    return bracketsIndexLevel
}

export const getBracketsToRemove = (recommendation: string, rightContext: string) => {
    const recommendationBrackets = calculateBracketsLevel(recommendation)
    const rightContextBrackets = calculateBracketsLevel(rightContext, true)
    let i = 0
    let j = 0
    const toBeRemoved = []

    while (i < recommendationBrackets.length && j < rightContextBrackets.length) {
        const { char: char1, count: level1 } = recommendationBrackets[i]
        const { char: char2, count: level2, idx: idx2 } = rightContextBrackets[j]
        if (char1 !== char2 || level1 !== level2) {
            i++
            continue
        }
        toBeRemoved.push(idx2)
        i++
        j++
    }
    return toBeRemoved
}

export const removeBracketsFromRightContext = async (
    editor: vscode.TextEditor,
    idxToRemove: number[],
    endPosition: vscode.Position
) => {
    const offset = editor.document.offsetAt(endPosition)

    if (isCloud9()) {
        const edits = idxToRemove.map(idx => ({
            range: new vscode.Range(
                editor.document.positionAt(offset + idx),
                editor.document.positionAt(offset + idx + 1)
            ),
            newText: '',
        }))
        const wEdit = new WorkspaceEdit()
        wEdit.set(editor.document.uri, [...edits])
        await workspace.applyEdit(wEdit)
    } else {
        await editor.edit(
            editBuilder => {
                idxToRemove.forEach(idx => {
                    const range = new vscode.Range(
                        editor.document.positionAt(offset + idx),
                        editor.document.positionAt(offset + idx + 1)
                    )
                    editBuilder.delete(range)
                })
            },
            { undoStopAfter: false, undoStopBefore: false }
        )
    }
}

export async function handleExtraBrackets(
    editor: vscode.TextEditor,
    recommendation: string,
    endPosition: vscode.Position
) {
    const end = editor.document.offsetAt(endPosition)
    const rightContext = editor.document.getText(
        new vscode.Range(
            editor.document.positionAt(end),
            editor.document.positionAt(end + CodeWhispererConstants.charactersLimit)
        )
    )
    const bracketsToRemove = getBracketsToRemove(recommendation, rightContext)
    if (bracketsToRemove.length) {
        await removeBracketsFromRightContext(editor, bracketsToRemove, endPosition)
    }
}
