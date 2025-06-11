/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { diffChars } from 'diff'
import * as vscode from 'vscode'
import { ToolkitError, getLogger, isWeb } from 'aws-core-vscode/shared'
import { diffUtilities } from 'aws-core-vscode/shared'

type Range = { line: number; start: number; end: number }

const logger = getLogger('nextEditPrediction')
export const imageVerticalOffset = 1

export class SvgGenerationService {
    /**
     * Generates an SVG image representing a code diff
     * @param originalCode The original code
     * @param newCode The new code with editsss
     * @param theme The editor theme information
     * @param offSet The margin to add to the left of the image
     */
    public async generateDiffSvg(
        filePath: string,
        udiff: string
    ): Promise<{
        svgImage: vscode.Uri
        startLine: number
        newCode: string
        origionalCodeHighlightRange: Range[]
    }> {
        const textDoc = await vscode.workspace.openTextDocument(filePath)
        const originalCode = textDoc.getText()
        if (originalCode === '') {
            logger.error(`udiff format error`)
            throw new ToolkitError('udiff format erro')
        }
        const newCode = await diffUtilities.getPatchedCode(filePath, udiff)
        const modifiedLines = diffUtilities.getModifiedLinesFromUnifiedDiff(udiff)
        // eslint-disable-next-line aws-toolkits/no-json-stringify-in-log
        logger.info(`Line mapping: ${JSON.stringify(modifiedLines)}`)

        if (isWeb() || !process.versions?.node) {
            logger.info('Skipping SVG generation in web mode')
            return {
                svgImage: vscode.Uri.parse(
                    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCI+PC9zdmc+'
                ),
                startLine: 0,
                newCode: newCode,
                origionalCodeHighlightRange: [{ line: 0, start: 0, end: 0 }],
            }
        }
        const { createSVGWindow } = await import('svgdom')

        const svgjs = await import('@svgdotjs/svg.js')
        const SVG = svgjs.SVG
        const registerWindow = svgjs.registerWindow

        // Get editor theme info
        const currentTheme = this.getEditorTheme()

        // Get edit diffs with highlight
        const { addedLines, removedLines } = this.getEditedLinesFromDiff(udiff)
        // const diffWithHighlight = this.getHighlightEdit(addedLines, modifiedLines)
        const highlightRanges = this.generateHighlightRanges(removedLines, addedLines, modifiedLines)
        const diffAddedWithHighlight = this.getHighlightEdit(addedLines, highlightRanges.addedRanges)

        // Create SVG window, document, and container
        const window = createSVGWindow()
        const document = window.document
        registerWindow(window, document)
        const draw = SVG(document.documentElement) as any

        // Calculate dimensions based on code content
        const { offset, editStartLine } = this.calculatePosition(
            originalCode.split('\n'),
            newCode.split('\n'),
            addedLines,
            currentTheme
        )
        const { width, height } = this.calculateDimensions(addedLines, currentTheme)
        draw.size(width + offset, height)

        // Generate CSS for syntax highlighting based on theme
        const styles = this.generateStyles(currentTheme)

        // Generate HTML content with syntax highlighting
        const htmlContent = this.generateHtmlContent(diffAddedWithHighlight, styles, offset)

        // Create foreignObject to embed HTML
        const foreignObject = draw.foreignObject(width + offset, height)
        foreignObject.node.innerHTML = htmlContent.trim()

        const svgData = draw.svg()
        const svgResult = `data:image/svg+xml;base64,${Buffer.from(svgData).toString('base64')}`
        // const adjustedStartLine = editStartLine > 0 ? editStartLine - 1 : editStartLine

        return {
            svgImage: vscode.Uri.parse(svgResult),
            startLine: editStartLine,
            newCode: newCode,
            origionalCodeHighlightRange: highlightRanges.removedRanges,
        }
    }

    private calculateDimensions(newLines: string[], currentTheme: editorThemeInfo): { width: number; height: number } {
        // Calculate appropriate width and height based on diff content
        const maxLineLength = Math.max(...newLines.map((line) => line.length))

        const headerFrontSize = Math.ceil(currentTheme.fontSize * 0.66)

        // Estimate width based on character count and font size
        const width = Math.max(41 * headerFrontSize * 0.7, maxLineLength * currentTheme.fontSize * 0.7)

        // Calculate height based on diff line count and line height
        const totalLines = newLines.length + 1 // +1 for header
        const height = totalLines * currentTheme.lingHeight + 25 // +10 for padding TODO, change to 10

        return { width, height }
    }

    private generateStyles(theme: editorThemeInfo): string {
        // Generate CSS styles based on editor theme
        const fontSize = theme.fontSize
        const headerFrontSize = Math.ceil(fontSize * 0.66)
        const lineHeight = theme.lingHeight
        const foreground = theme.foreground
        const bordeColor = 'rgba(212, 212, 212, 0.5)'
        const background = theme.background || '#1e1e1e'
        const diffRemoved = theme.diffRemoved || 'rgba(255, 0, 0, 0.2)'
        const diffAdded = 'rgba(72, 128, 72, 0.52)'
        return `
            .code-container {
                font-family: ${'monospace'};
                color: ${foreground};
                font-size: ${fontSize}px;
                line-height: ${lineHeight}px;
                background-color: ${background};
                border: 1px solid ${bordeColor};
                border-radius: 0px;
                padding-top: 3px;
                padding-bottom: 5px;
                padding-left: 10px;
            }
            .diff-header {
                color: ${theme.foreground || '#d4d4d4'};
                margin: 0;
                font-size: ${headerFrontSize}px;
                padding: 0px;
            }
            .diff-removed {
                background-color: ${diffRemoved};
                white-space: pre-wrap; /* Preserve whitespace */
                text-decoration: line-through;
                opacity: 0.7;
            }
            .diff-changed {
                white-space: pre-wrap; /* Preserve whitespace */
                background-color: ${diffAdded};
            }
        `
    }

    private generateHtmlContent(diffLines: string[], styles: string, offSet: number): string {
        return `
            <div xmlns="http://www.w3.org/1999/xhtml">
                <style>${styles}</style>
                <div class="code-container" style="margin-left: ${offSet}px;">
                    <div class="diff-header">Q: Press [Tab] to accept or [Esc] to reject:</div>
                    ${diffLines.map((line) => `<div>${line}</div>`).join('')}
                </div>
            </div>
        `
    }

    /**
     * Extract added and removed lines from the unified diff
     * @param unifiedDiff The unified diff string
     * @returns Object containing arrays of added and removed lines
     */
    private getEditedLinesFromDiff(unifiedDiff: string): { addedLines: string[]; removedLines: string[] } {
        const addedLines: string[] = []
        const removedLines: string[] = []
        const diffLines = unifiedDiff.split('\n')

        // Find all hunks in the diff
        const hunkStarts = diffLines
            .map((line, index) => (line.startsWith('@@ ') ? index : -1))
            .filter((index) => index !== -1)

        // Process each hunk to find added and removed lines
        for (const hunkStart of hunkStarts) {
            // Parse the hunk header
            const hunkHeader = diffLines[hunkStart]
            const match = hunkHeader.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/)

            if (!match) {
                continue
            }

            // Extract the content lines for this hunk
            let i = hunkStart + 1
            while (i < diffLines.length && !diffLines[i].startsWith('@@')) {
                // Include lines that were added (start with '+')
                if (diffLines[i].startsWith('+') && !diffLines[i].startsWith('+++')) {
                    const lineContent = diffLines[i].substring(1)
                    addedLines.push(lineContent)
                }
                // Include lines that were removed (start with '-')
                else if (diffLines[i].startsWith('-') && !diffLines[i].startsWith('---')) {
                    const lineContent = diffLines[i].substring(1)
                    removedLines.push(lineContent)
                }
                i++
            }
        }

        return { addedLines, removedLines }
    }

    /**
     * Applies highlighting to code lines based on the specified ranges
     * @param newLines Array of code lines to highlight
     * @param highlightRanges Array of ranges specifying which parts of the lines to highlight
     * @returns Array of HTML strings with appropriate spans for highlighting
     */
    private getHighlightEdit(newLines: string[], highlightRanges: Range[]): string[] {
        const result: string[] = []

        // Group ranges by line for easier lookup
        const rangesByLine = new Map<number, Range[]>()
        for (const range of highlightRanges) {
            if (!rangesByLine.has(range.line)) {
                rangesByLine.set(range.line, [])
            }
            rangesByLine.get(range.line)!.push(range)
        }

        // Process each line of code
        for (let lineIndex = 0; lineIndex < newLines.length; lineIndex++) {
            const line = newLines[lineIndex]
            // Get ranges for this line
            const lineRanges = rangesByLine.get(lineIndex) || []

            // If no ranges for this line, leave it as-is with HTML escaping
            if (lineRanges.length === 0) {
                result.push(this.escapeHtml(line))
                continue
            }

            // Sort ranges by start position to ensure correct ordering
            lineRanges.sort((a, b) => a.start - b.start)

            // Build the highlighted line
            let highlightedLine = ''
            let currentPos = 0

            for (const range of lineRanges) {
                // Add text before the current range (with HTML escaping)
                if (range.start > currentPos) {
                    const beforeText = line.substring(currentPos, range.start)
                    highlightedLine += this.escapeHtml(beforeText)
                }

                // Add the highlighted part (with HTML escaping)
                const highlightedText = line.substring(range.start, range.end)
                highlightedLine += `<span class="diff-changed">${this.escapeHtml(highlightedText)}</span>`

                // Update current position
                currentPos = range.end
            }

            // Add any remaining text after the last range (with HTML escaping)
            if (currentPos < line.length) {
                const afterText = line.substring(currentPos)
                highlightedLine += this.escapeHtml(afterText)
            }

            result.push(highlightedLine)
        }

        return result
    }

    private getEditorTheme(): editorThemeInfo {
        const editorConfig = vscode.workspace.getConfiguration('editor')
        const fontSize = editorConfig.get<number>('fontSize', 12) // Default to 12 if not set
        const lineHeightSetting = editorConfig.get<number>('lineHeight', 0) // Default to 0 if not set

        /**
         * Calculate effective line height, documented as such:
         * Use 0 to automatically compute the line height from the font size.
         * Values between 0 and 8 will be used as a multiplier with the font size.
         * Values greater than or equal to 8 will be used as effective values.
         */
        let effectiveLineHeight: number
        if (lineHeightSetting > 0 && lineHeightSetting < 8) {
            effectiveLineHeight = lineHeightSetting * fontSize
        } else if (lineHeightSetting >= 8) {
            effectiveLineHeight = lineHeightSetting
        } else {
            effectiveLineHeight = Math.round(1.5 * fontSize)
        }

        // Get current theme name
        const themeName = vscode.workspace.getConfiguration('workbench').get<string>('colorTheme', 'Default')

        // Define theme colors
        const themeColors = this.getThemeColors(themeName)

        return {
            fontSize: fontSize,
            lingHeight: effectiveLineHeight,
            ...themeColors,
        }
    }

    private getThemeColors(themeName: string): {
        foreground: string
        background: string
        diffAdded: string
        diffRemoved: string
    } {
        // Define default dark theme colors
        const darkThemeColors = {
            foreground: 'rgba(212, 212, 212, 1)',
            background: 'rgba(30, 30, 30, 1)',
            diffAdded: 'rgba(231, 245, 231, 0.2)',
            diffRemoved: 'rgba(255, 0, 0, 0.2)',
        }

        // Define default light theme colors
        const lightThemeColors = {
            foreground: 'rgba(0, 0, 0, 1)',
            background: 'rgba(255, 255, 255, 1)',
            diffAdded: 'rgba(198, 239, 206, 0.2)',
            diffRemoved: 'rgba(255, 199, 206, 0.5)',
        }

        // Define colors for specific themes
        const themeColorMap: {
            [key: string]: { foreground: string; background: string; diffAdded: string; diffRemoved: string }
        } = {
            Abyss: {
                foreground: 'rgba(255, 255, 255, 1)',
                background: 'rgba(0, 12, 24, 1)',
                diffAdded: 'rgba(0, 255, 0, 0.2)',
                diffRemoved: 'rgba(255, 0, 0, 0.3)',
            },
            Red: {
                foreground: 'rgba(255, 0, 0, 1)',
                background: 'rgba(51, 0, 0, 1)',
                diffAdded: 'rgba(255, 100, 100, 0.2)',
                diffRemoved: 'rgba(255, 0, 0, 0.5)',
            },
            // Add more themes as needed
        }

        // Check if theme name contains "dark" or "light"
        const themeNameLower = themeName.toLowerCase()

        if (themeNameLower.includes('dark')) {
            return darkThemeColors
        } else if (themeNameLower.includes('light')) {
            return lightThemeColors
        }

        // Return colors for the specific theme or default to light theme
        return themeColorMap[themeName] || lightThemeColors
    }

    private calculatePosition(
        originalLines: string[],
        newLines: string[],
        diffLines: string[],
        theme: editorThemeInfo
    ): { offset: number; editStartLine: number } {
        // Determine the starting line of the edit in the original file
        let editStartLineInOldFile = 0
        const maxLength = Math.min(originalLines.length, newLines.length)

        for (let i = 0; i <= maxLength; i++) {
            if (originalLines[i] !== newLines[i] || i === maxLength) {
                editStartLineInOldFile = i
                break
            }
        }
        const shiftedStartLine = Math.max(0, editStartLineInOldFile - imageVerticalOffset)

        // Determine the range to consider
        const startLine = shiftedStartLine
        const endLine = Math.min(editStartLineInOldFile + diffLines.length, originalLines.length)

        // Find the longest line within the specified range
        let maxLineLength = 0
        for (let i = startLine; i <= endLine; i++) {
            const lineLength = originalLines[i]?.length || 0
            if (lineLength > maxLineLength) {
                maxLineLength = lineLength
            }
        }

        // Calculate the offset based on the longest line and the starting line length
        const startLineLength = originalLines[startLine]?.length || 0
        const offset = (maxLineLength - startLineLength) * theme.fontSize * 0.7 + 10 // padding

        return { offset, editStartLine: editStartLineInOldFile }
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
    }

    /**
     * Generates character-level highlight ranges for both original and modified code.
     * @param originalCode Array of original code lines
     * @param afterCode Array of code lines after modification
     * @param modifiedLines Map of original lines to modified lines
     * @returns Object containing ranges for original and after code character level highlighting
     */
    private generateHighlightRanges(
        originalCode: string[],
        afterCode: string[],
        modifiedLines: Map<string, string>
    ): { removedRanges: Range[]; addedRanges: Range[] } {
        const originalRanges: Range[] = []
        const afterRanges: Range[] = []

        /**
         * Merges ranges on the same line that are separated by only one character
         */
        const mergeAdjacentRanges = (ranges: Range[]): Range[] => {
            const sortedRanges = [...ranges].sort((a, b) => {
                if (a.line !== b.line) {
                    return a.line - b.line
                }
                return a.start - b.start
            })

            const result: Range[] = []

            // Process all ranges
            for (let i = 0; i < sortedRanges.length; i++) {
                const current = sortedRanges[i]

                // If this is the last range or ranges are on different lines, add it directly
                if (i === sortedRanges.length - 1 || current.line !== sortedRanges[i + 1].line) {
                    result.push(current)
                    continue
                }

                // Check if current range and next range can be merged
                const next = sortedRanges[i + 1]
                if (current.line === next.line && next.start - current.end <= 1) {
                    // Merge the ranges
                    sortedRanges[i + 1] = {
                        line: current.line,
                        start: current.start,
                        end: Math.max(current.end, next.end),
                    }
                    // Skip the current range (we merged it with the next one)
                } else {
                    result.push(current)
                }
            }

            return result
        }

        // Create reverse mapping for quicker lookups
        const reverseMap = new Map<string, string>()
        for (const [original, modified] of modifiedLines.entries()) {
            reverseMap.set(modified, original)
        }

        // Process original code lines
        for (let lineIndex = 0; lineIndex < originalCode.length; lineIndex++) {
            const line = originalCode[lineIndex]

            // If line exists in modifiedLines as a key, process character diffs
            if (Array.from(modifiedLines.keys()).includes(line)) {
                // Get the corresponding modified line
                const modifiedLine = modifiedLines.get(line)!

                // Get character-level diffs
                const changes = diffChars(line, modifiedLine)

                // Add ranges for removed parts
                let charPos = 0
                for (const part of changes) {
                    if (part.removed) {
                        originalRanges.push({
                            line: lineIndex,
                            start: charPos,
                            end: charPos + part.value.length,
                        })
                    }

                    // Only advance position for parts that exist in original
                    if (!part.added) {
                        charPos += part.value.length
                    }
                }
            } else {
                // Line doesn't exist in modifiedLines keys, highlight entire line
                originalRanges.push({
                    line: lineIndex,
                    start: 0,
                    end: line.length,
                })
            }
        }

        // Process after code lines
        for (let lineIndex = 0; lineIndex < afterCode.length; lineIndex++) {
            const line = afterCode[lineIndex]

            // If line exists in reverseMap (is a value in modifiedLines), process character diffs
            if (reverseMap.has(line)) {
                // Get the corresponding original line
                const originalLine = reverseMap.get(line)!

                // Get character-level diffs
                const changes = diffChars(originalLine, line)

                // Add ranges for added parts
                let charPos = 0
                for (const part of changes) {
                    if (part.added) {
                        afterRanges.push({
                            line: lineIndex,
                            start: charPos,
                            end: charPos + part.value.length,
                        })
                    }

                    // Only advance position for parts that exist in the modified version
                    if (!part.removed) {
                        charPos += part.value.length
                    }
                }
            } else {
                // Line doesn't exist in modifiedLines values, highlight entire line
                afterRanges.push({
                    line: lineIndex,
                    start: 0,
                    end: line.length,
                })
            }
        }

        // Apply post-processing to merge adjacent ranges
        const mergedOriginalRanges = mergeAdjacentRanges(originalRanges)
        const mergedAfterRanges = mergeAdjacentRanges(afterRanges)

        return {
            removedRanges: mergedOriginalRanges,
            addedRanges: mergedAfterRanges,
        }
    }
}

interface editorThemeInfo {
    fontSize: number
    lingHeight: number
    foreground?: string
    background?: string
    diffAdded?: string
    diffRemoved?: string
}
