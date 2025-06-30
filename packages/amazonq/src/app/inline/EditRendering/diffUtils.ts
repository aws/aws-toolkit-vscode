/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
// TODO: deprecate this file in favor of core/shared/utils/diffUtils
import { applyPatch } from 'diff'

export type LineDiff =
    | { type: 'added'; content: string }
    | { type: 'removed'; content: string }
    | { type: 'modified'; before: string; after: string }

/**
 * Apply a unified diff to original code to generate modified code
 * @param originalCode The original code as a string
 * @param unifiedDiff The unified diff content
 * @returns The modified code after applying the diff
 */
export function applyUnifiedDiff(
    docText: string,
    unifiedDiff: string
): { appliedCode: string; addedCharacterCount: number; deletedCharacterCount: number } {
    try {
        const { addedCharacterCount, deletedCharacterCount } = getAddedAndDeletedCharCount(unifiedDiff)
        // First try the standard diff package
        try {
            const result = applyPatch(docText, unifiedDiff)
            if (result !== false) {
                return {
                    appliedCode: result,
                    addedCharacterCount: addedCharacterCount,
                    deletedCharacterCount: deletedCharacterCount,
                }
            }
        } catch (error) {}

        // Parse the unified diff to extract the changes
        const diffLines = unifiedDiff.split('\n')
        let result = docText

        // Find all hunks in the diff
        const hunkStarts = diffLines
            .map((line, index) => (line.startsWith('@@ ') ? index : -1))
            .filter((index) => index !== -1)

        // Process each hunk
        for (const hunkStart of hunkStarts) {
            // Parse the hunk header
            const hunkHeader = diffLines[hunkStart]
            const match = hunkHeader.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/)

            if (!match) {
                continue
            }

            const oldStart = parseInt(match[1])
            const oldLines = parseInt(match[2])

            // Extract the content lines for this hunk
            let i = hunkStart + 1
            const contentLines = []
            while (i < diffLines.length && !diffLines[i].startsWith('@@')) {
                contentLines.push(diffLines[i])
                i++
            }

            // Build the old and new text
            let oldText = ''
            let newText = ''

            for (const line of contentLines) {
                if (line.startsWith('-')) {
                    oldText += line.substring(1) + '\n'
                } else if (line.startsWith('+')) {
                    newText += line.substring(1) + '\n'
                } else if (line.startsWith(' ')) {
                    oldText += line.substring(1) + '\n'
                    newText += line.substring(1) + '\n'
                }
            }

            // Remove trailing newline if it was added
            oldText = oldText.replace(/\n$/, '')
            newText = newText.replace(/\n$/, '')

            // Find the text to replace in the document
            const docLines = docText.split('\n')
            const startLine = oldStart - 1 // Convert to 0-based
            const endLine = startLine + oldLines

            // Extract the text that should be replaced
            const textToReplace = docLines.slice(startLine, endLine).join('\n')

            // Replace the text
            result = result.replace(textToReplace, newText)
        }
        return {
            appliedCode: result,
            addedCharacterCount: addedCharacterCount,
            deletedCharacterCount: deletedCharacterCount,
        }
    } catch (error) {
        return {
            appliedCode: docText, // Return original text if all methods fail
            addedCharacterCount: 0,
            deletedCharacterCount: 0,
        }
    }
}

export function getAddedAndDeletedCharCount(diff: string): {
    addedCharacterCount: number
    deletedCharacterCount: number
} {
    let addedCharacterCount = 0
    let deletedCharacterCount = 0
    let i = 0
    const lines = diff.split('\n')
    while (i < lines.length) {
        const line = lines[i]
        if (line.startsWith('+') && !line.startsWith('+++')) {
            addedCharacterCount += line.length - 1
        } else if (line.startsWith('-') && !line.startsWith('---')) {
            const removedLine = line.substring(1)
            deletedCharacterCount += removedLine.length

            // Check if this is a modified line rather than a pure deletion
            const nextLine = lines[i + 1]
            if (nextLine && nextLine.startsWith('+') && !nextLine.startsWith('+++') && nextLine.includes(removedLine)) {
                // This is a modified line, not a pure deletion
                // We've already counted the deletion, so we'll just increment i to skip the next line
                // since we'll process the addition on the next iteration
                i += 1
            }
        }
        i += 1
    }
    return {
        addedCharacterCount,
        deletedCharacterCount,
    }
}
