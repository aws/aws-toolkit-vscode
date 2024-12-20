/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { type LinesOptions, diffLines, Change } from 'diff'
import * as vscode from 'vscode'
import { InlineTask, TextDiff } from '../controller/inlineTask'

export function computeDiff(response: string, inlineTask: InlineTask, isPartialDiff: boolean): TextDiff[] | undefined {
    if (!response) {
        return
    }
    const selectedRange = inlineTask.selectedRange
    const partialSelectedText = inlineTask.partialSelectedText ?? ''
    const selectedText = isPartialDiff ? partialSelectedText : inlineTask.selectedText

    const normalizedResponse =
        getLeadingWhitespace(selectedText) + response.trim() + getTrailingWhitespace(selectedText)

    const diffs = diffLines(selectedText, normalizedResponse, {
        stripTrailingCr: true,
        ignoreNewlineAtEof: true,
    } as LinesOptions)

    const textDiff: TextDiff[] = []
    let startLine = selectedRange.start.line
    for (const part of diffs) {
        const count = part.count ?? 0
        if (part.removed) {
            if (part.value !== '\n') {
                textDiff.push({
                    type: 'deletion',
                    originalText: part.value,
                    range: new vscode.Range(startLine, 0, startLine + count, 0),
                })
            }
        } else if (part.added) {
            if (part.value !== '\n') {
                // The partial response sometimes doesn't have the correct ending newline character (\n), so we ensure that every insertion respects the code formatting.
                if (isPartialDiff && !part.value.endsWith('\n')) {
                    part.value += '\n'
                }
                textDiff.push({
                    type: 'insertion',
                    replacementText: part.value,
                    range: new vscode.Range(startLine, 0, startLine + count, 0),
                })
            }
        }
        startLine += count
    }
    inlineTask.diff = textDiff
    return textDiff
}

export function adjustTextDiffForEditing(textDiff: TextDiff[]): TextDiff[] {
    let linesAdded = 0
    const adjustedDiff: TextDiff[] = []

    for (const edit of textDiff) {
        const { range, type } = edit
        const { start, end } = range
        const linesChanged = end.line - start.line

        const adjustedRange = new vscode.Range(
            new vscode.Position(start.line - linesAdded, start.character),
            new vscode.Position(end.line - linesAdded, end.character)
        )

        adjustedDiff.push({
            ...edit,
            range: adjustedRange,
        })

        if (type === 'insertion') {
            linesAdded += linesChanged
        }
    }

    return adjustedDiff
}

export function getDiffBlocks(inlineTask: InlineTask): vscode.Range[] {
    const diff = inlineTask.diff

    if (!diff || diff.length === 0) {
        return []
    }

    const diffBlocks: vscode.Range[] = []
    let currentRange: vscode.Range | undefined

    for (const change of diff) {
        const { range } = change
        if (!currentRange || range.start.line !== currentRange.end.line) {
            currentRange = range
            diffBlocks.push(range)
        } else {
            currentRange = new vscode.Range(currentRange.start, range.end)
            diffBlocks[diffBlocks.length - 1] = currentRange
        }
    }

    return diffBlocks
}

function getLeadingWhitespace(str: string): string {
    const match = str.match(/^\s*/)
    return match ? match[0] : ''
}

function getTrailingWhitespace(str: string): string {
    const match = str.match(/\s*$/)
    return match ? match[0] : ''
}
