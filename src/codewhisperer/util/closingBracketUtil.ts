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

export const calculateBracketsLevel = (
    editor: vscode.TextEditor,
    code: string,
    isRightContext: boolean = false,
    end: vscode.Position,
    start: vscode.Position
) => {
    const bracketCounts: Map<string, number> = new Map([
        ['(', 0],
        ['[', 0],
        ['{', 0],
    ])
    const bracketsIndexLevel = []
    let position: vscode.Position
    for (let i = 0; i < code.length; i++) {
        const char = code[i]
        if (isRightContext) {
            position = editor.document.positionAt(editor.document.offsetAt(end) + i)
        } else {
            position = editor.document.positionAt(editor.document.offsetAt(start) + i)
        }

        if (bracketCounts.has(char)) {
            const count = bracketCounts.get(char) || 0
            const newCount = count + 1
            bracketCounts.set(char, newCount)
            bracketsIndexLevel.push({
                char,
                count: newCount,
                idx: i,
                position: position,
            })
        } else if (char in bracketMap) {
            const correspondingBracket = bracketMap[char as keyof bracketMapType]
            const count = bracketCounts.get(correspondingBracket) || 0
            const newCount = count === 0 ? 0 : count - 1
            bracketCounts.set(bracketMap[char], newCount)

            if (
                bracketsIndexLevel.length > 0 &&
                bracketsIndexLevel[bracketsIndexLevel.length - 1].char === correspondingBracket
            ) {
                bracketsIndexLevel.pop()
            } else {
                bracketsIndexLevel.push({
                    char: char,
                    count: newCount,
                    idx: i,
                    position: position,
                })
            }
        } else if (isRightContext && !(char in bracketMap) && !bracketCounts.has(char) && !/\s/.test(char)) {
            // we can stop processing right context when we encounter a char that is not a bracket nor white space
            break
        }
    }
    return bracketsIndexLevel
}

/**
 * 1. indentation is exact the same
 * 2. closing braket is in the same line as opening (this closing is added by the IDE)
 */
export const getBracketsToRemove = (
    editor: vscode.TextEditor,
    recommendation: string,
    rightContext: string,
    end: vscode.Position,
    start: vscode.Position
) => {
    const recommendationBrackets = calculateBracketsLevel(editor, recommendation, false, end, start)
    const rightContextBrackets = calculateBracketsLevel(editor, rightContext, true, end, start)
    let i = 0
    let j = 0
    const toBeRemoved = []

    while (i < recommendationBrackets.length && j < rightContextBrackets.length) {
        const { char: char1, count: level1, idx: idx1, position: position1 } = recommendationBrackets[i]
        const { char: char2, count: level2, idx: idx2, position: position2 } = rightContextBrackets[j]
        if (char1 !== char2 || level1 !== level2) {
            i++
            continue
        }

        const char = editor.document.getText(new vscode.Range(start.translate(0, -1), start))
        const originalOffset = editor.document.offsetAt(position2) - recommendation.length

        const isSameLine =
            char === bracketMap[char2 as keyof bracketMapType] &&
            start.line === editor.document.positionAt(originalOffset).line
        let hasSameIndentation: boolean

        const indent1 = editor.document.getText(
            new vscode.Range(position1.line, 0, position1.line, position1.character)
        )
        const indent2 = editor.document.getText(
            new vscode.Range(position2.line, 0, position2.line, position2.character)
        )

        if (indent1.trim().length === 0 && indent2.trim().length === 0) {
            hasSameIndentation = indent1.length === indent2.length
        } else {
            hasSameIndentation = false
        }

        if (isSameLine || hasSameIndentation) {
            toBeRemoved.push(idx2)
        }

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
    endPosition: vscode.Position,
    startPosition: vscode.Position
) {
    const end = editor.document.offsetAt(endPosition)
    const rightContext = editor.document.getText(
        new vscode.Range(
            editor.document.positionAt(end),
            editor.document.positionAt(end + CodeWhispererConstants.charactersLimit)
        )
    )
    const bracketsToRemove = getBracketsToRemove(editor, recommendation, rightContext, endPosition, startPosition)
    if (bracketsToRemove.length) {
        await removeBracketsFromRightContext(editor, bracketsToRemove, endPosition)
    }
}
