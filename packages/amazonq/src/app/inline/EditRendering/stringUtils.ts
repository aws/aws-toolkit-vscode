/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Strips common indentation from each line of code that may contain HTML tags
 * @param lines Array of code lines (may contain HTML tags)
 * @returns Array of code lines with common indentation removed
 */
export function stripCommonIndentation(lines: string[]): string[] {
    if (lines.length === 0) {
        return lines
    }
    const removeFirstTag = (line: string) => line.replace(/^<[^>]*>/, '')
    const getLeadingWhitespace = (text: string) => text.match(/^\s*/)?.[0] || ''

    // Find minimum indentation across all lines
    const minIndentLength = Math.min(...lines.map((line) => getLeadingWhitespace(removeFirstTag(line)).length))

    // Remove common indentation from each line
    return lines.map((line) => {
        const firstTagRemovedLine = removeFirstTag(line)
        const leadingWhitespace = getLeadingWhitespace(firstTagRemovedLine)
        const reducedWhitespace = leadingWhitespace.substring(minIndentLength)
        return line.replace(leadingWhitespace, reducedWhitespace)
    })
}
