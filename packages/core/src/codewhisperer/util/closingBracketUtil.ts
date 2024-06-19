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

const quotes = ["'", '"', '`']
const parenthesis = ['(', '[', '{', ')', ']', '}', '<', '>']

const closeToOpen: bracketMapType = {
    ')': '(',
    ']': '[',
    '}': '{',
    '>': '<',
}

const openToClose: bracketMapType = {
    '(': ')',
    '[': ']',
    '{': '}',
    '<': '>',
}

/**
 * LeftContext | Recommendation | RightContext
 * This function aims to resolve symbols which are redundant and need to be removed
 * The high level logic is as followed
 *   1. Pair non-paired closing symbols(parenthesis, brackets, quotes) existing in the "recommendation" with non-paired symbols existing in the "leftContext"
 *   2. Remove non-paired closing symbols existing in the "rightContext"
 * @param endPosition: end position of the effective recommendation written by CodeWhisperer
 * @param startPosition: start position of the effective recommendation by CodeWhisperer
 *
 * for example given file context ('|' is where we trigger the service):
 * anArray.pu|
 * recommendation returned: "sh(element);"
 * typeahead: "sh("
 * the effective recommendation written by CodeWhisperer: "element);"
 */
export async function handleExtraBrackets(
    editor: vscode.TextEditor,
    endPosition: vscode.Position,
    startPosition: vscode.Position
) {
    const recommendation = editor.document.getText(new vscode.Range(startPosition, endPosition))
    const endOffset = editor.document.offsetAt(endPosition)
    const startOffset = editor.document.offsetAt(startPosition)
    const leftContext = editor.document.getText(
        new vscode.Range(
            startPosition,
            editor.document.positionAt(Math.max(startOffset - CodeWhispererConstants.charactersLimit, 0))
        )
    )

    const rightContext = editor.document.getText(
        new vscode.Range(
            editor.document.positionAt(endOffset),
            editor.document.positionAt(endOffset + CodeWhispererConstants.charactersLimit)
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

    const quotesToRemove = getQuotesToRemove(
        editor,
        recommendation,
        leftContext,
        rightContext,
        endPosition,
        startPosition
    )

    const symbolsToRemove = [...bracketsToRemove, ...quotesToRemove]

    if (symbolsToRemove.length) {
        await removeBracketsFromRightContext(editor, symbolsToRemove, endPosition)
    }
}

const removeBracketsFromRightContext = async (
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

function getBracketsToRemove(
    editor: vscode.TextEditor,
    recommendation: string,
    leftContext: string,
    rightContext: string,
    end: vscode.Position,
    start: vscode.Position
) {
    const unpairedClosingsInReco = nonClosedClosingParen(recommendation)
    const unpairedOpeningsInLeftContext = nonClosedOpneingParen(leftContext, unpairedClosingsInReco.length)
    const unpairedClosingsInRightContext = nonClosedClosingParen(rightContext)

    const toRemove: number[] = []

    let i = 0
    let j = 0
    let k = 0
    while (i < unpairedOpeningsInLeftContext.length && j < unpairedClosingsInReco.length) {
        const opening = unpairedOpeningsInLeftContext[i]
        const closing = unpairedClosingsInReco[j]

        const isPaired = closeToOpen[closing.char] === opening.char
        const rightContextCharToDelete = unpairedClosingsInRightContext[k]

        if (isPaired) {
            if (rightContextCharToDelete && rightContextCharToDelete.char === closing.char) {
                const rightContextStart = editor.document.offsetAt(end) + 1
                const symbolPosition = editor.document.positionAt(
                    rightContextStart + rightContextCharToDelete.strOffset
                )
                const lineCnt = recommendation.split('\n').length - 1
                const isSameline = symbolPosition.line - lineCnt === start.line

                if (isSameline) {
                    toRemove.push(rightContextCharToDelete.strOffset)
                }

                k++
            }
        }

        i++
        j++
    }

    return toRemove
}

function getQuotesToRemove(
    editor: vscode.TextEditor,
    recommendation: string,
    leftContext: string,
    rightContext: string,
    endPosition: vscode.Position,
    startPosition: vscode.Position
) {
    let leftQuote: string | undefined = undefined
    let leftIndex: number | undefined = undefined
    for (let i = leftContext.length - 1; i >= 0; i--) {
        const char = leftContext[i]
        if (quotes.includes(char)) {
            leftQuote = char
            leftIndex = leftContext.length - i
            break
        }
    }

    let rightQuote: string | undefined = undefined
    let rightIndex: number | undefined = undefined
    for (let i = 0; i < rightContext.length; i++) {
        const char = rightContext[i]
        if (quotes.includes(char)) {
            rightQuote = char
            rightIndex = i
            break
        }
    }

    let quoteCountInReco = 0
    if (leftQuote && rightQuote && leftQuote === rightQuote) {
        for (const char of recommendation) {
            if (quotes.includes(char) && char === leftQuote) {
                quoteCountInReco++
            }
        }
    }

    if (leftIndex !== undefined && rightIndex !== undefined && quoteCountInReco % 2 !== 0) {
        const p = editor.document.positionAt(editor.document.offsetAt(endPosition) + rightIndex)

        if (endPosition.line === startPosition.line && endPosition.line === p.line) {
            return [rightIndex]
        }
    }

    return []
}

function nonClosedOpneingParen(str: string, cnt?: number): { char: string; strOffset: number }[] {
    const resultSet: { char: string; strOffset: number }[] = []
    const stack: string[] = []

    for (let i = str.length - 1; i >= 0; i--) {
        const char = str[i]
        if (char! in parenthesis) {
            continue
        }

        if (char in closeToOpen) {
            stack.push(char)
            if (cnt && cnt === resultSet.length) {
                return resultSet
            }
        } else if (char in openToClose) {
            if (stack.length !== 0 && stack[stack.length - 1] === openToClose[char]) {
                stack.pop()
            } else {
                resultSet.push({ char: char, strOffset: i })
            }
        }
    }

    return resultSet
}

function nonClosedClosingParen(str: string, cnt?: number): { char: string; strOffset: number }[] {
    const resultSet: { char: string; strOffset: number }[] = []
    const stack: string[] = []

    for (let i = 0; i < str.length; i++) {
        const char = str[i]
        if (char! in parenthesis) {
            continue
        }

        if (char in openToClose) {
            stack.push(char)
            if (cnt && cnt === resultSet.length) {
                return resultSet
            }
        } else if (char in closeToOpen) {
            if (stack.length !== 0 && stack[stack.length - 1] === closeToOpen[char]) {
                stack.pop()
            } else {
                resultSet.push({ char: char, strOffset: i })
            }
        }
    }

    return resultSet
}
