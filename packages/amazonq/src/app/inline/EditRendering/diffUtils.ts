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
export function applyUnifiedDiff(docText: string, unifiedDiff: string): string {
    try {
        // First try the standard diff package
        try {
            const result = applyPatch(docText, unifiedDiff)
            if (result !== false) {
                return result
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
        return result
    } catch (error) {
        return docText // Return original text if all methods fail
    }
}
