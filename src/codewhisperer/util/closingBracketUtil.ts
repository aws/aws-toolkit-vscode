/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { workspace, WorkspaceEdit } from 'vscode'
import { isCloud9 } from '../../shared/extensionUtilities'
import * as CodeWhispererConstants from '../models/constants'

interface bracketMapType {
    [k: string]: string
}

const quotes = ["'", '"']

const closing: bracketMapType = {
    ')': '(',
    ']': '[',
    '}': '{',
    "'": "'",
    '"': '"',
    '`': '`',
}

const openning: bracketMapType = {
    '(': ')',
    '[': ']',
    '{': '}',
    "'": "'",
    '"': '"',
    '`': '`',
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
        ['"', 0],
        ["'", 0],
    ])
    const bracketsIndexLevel: { char: string; count: number; idx: number; position: vscode.Position }[] = []
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
        } else if (char in closing) {
            const correspondingBracket = closing[char as keyof bracketMapType]
            const count = bracketCounts.get(correspondingBracket) || 0
            const newCount = count === 0 ? 0 : count - 1
            bracketCounts.set(closing[char], newCount)

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
        } else if (isRightContext && !(char in closing) && !bracketCounts.has(char) && !/\s/.test(char)) {
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
    leftContext: string,
    rightContext: string,
    end: vscode.Position,
    start: vscode.Position
) => {
    const recommendationBrackets = calculateBracketsLevel(editor, recommendation, false, end, start)
    const rightContextBrackets = calculateBracketsLevel(editor, rightContext, true, end, start)
    let i = 0
    let j = 0
    const toBeRemoved: number[] = []

    while (i < recommendationBrackets.length && j < rightContextBrackets.length) {
        const { char: char1, count: level1, idx: _, position: position1 } = recommendationBrackets[i]
        const { char: char2, count: level2, idx: idx2, position: position2 } = rightContextBrackets[j]
        if (char1 !== char2 || level1 !== level2) {
            i++
            continue
        }

        // char is the last character in leftContext, aiming to capture case where IDE add the closing parenthesis (), [], {}
        const char = findFirstNonClosedOpneingParen(leftContext, true)

        if (char) {
            const originalOffset = editor.document.offsetAt(position2) - recommendation.length + 1

            const isSameLine = !(char in openning)
                ? false
                : isPairedSymbol(char, char2) && start.line === editor.document.positionAt(originalOffset).line

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

            if (isSameLine && indent2.length !== 0) {
                toBeRemoved.push(idx2)
            } else if (hasSameIndentation) {
                toBeRemoved.push(idx2)
            }
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

/**
 * @param endPosition: end position of the recommendation
 * @param startPosition: start position of the recommendation
 */
export async function handleExtraBrackets(
    editor: vscode.TextEditor,
    recommendation: string,
    endPosition: vscode.Position,
    startPosition: vscode.Position
) {
    const end = editor.document.offsetAt(endPosition)
    const leftContext = editor.document.getText(
        new vscode.Range(
            startPosition,
            editor.document.positionAt(
                Math.max(editor.document.offsetAt(startPosition) - CodeWhispererConstants.charactersLimit, 0)
            )
        )
    )

    const rightContext = editor.document.getText(
        new vscode.Range(
            editor.document.positionAt(end),
            editor.document.positionAt(end + CodeWhispererConstants.charactersLimit)
        )
    )
    const bracketsToRemove = getBracketsToRemove(
        editor,
        recommendation,
        leftContext,
        rightContext,
        endPosition,
        startPosition
    )
    if (bracketsToRemove.length) {
        await removeBracketsFromRightContext(editor, bracketsToRemove, endPosition)
    }
}

function isPairedSymbol(char1: string, char2: string) {
    return isPairedParenthesis(char1, char2) || isPairedQuotes(char1, char2)
}

function isPairedParenthesis(char1: string, char2: string) {
    if (char1.length !== 1 || char2.length !== 1) {
        return false
    }

    if (char1 === char2) {
        return false
    }

    const condition1 = char1 in openning && char2 in closing
    const condition2 = char1 in closing && char2 in openning

    return condition1 || condition2
}

function isPairedQuotes(char1: string, char2: string) {
    if (char1.length !== 1 || char2.length !== 1) {
        return false
    }

    if (!quotes.includes(char1) || !quotes.includes(char2)) {
        return false
    }

    const condition1 = char1 in openning && char2 in closing
    const condition2 = char1 in closing && char2 in openning

    return char1 === char2 && (condition1 || condition2)
}

function findFirstNonClosedOpneingParen(str: string, reverseSearch: boolean): string | undefined {
    if (reverseSearch) {
        str = [...str].reverse().join('')
    }
    for (const char of str) {
        if (char in openning) {
            return char
        }
    }
    return undefined
}
