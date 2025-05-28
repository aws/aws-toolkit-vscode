/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { diffLines } from 'diff'
import * as vscode from 'vscode'
import { applyUnifiedDiff } from './diffUtils'
import { getLogger, isWeb } from 'aws-core-vscode/shared'

const logger = getLogger('nextEditPrediction')

export class SvgGenerationService {
    /**
     * Generates an SVG image representing a code diff
     * @param originalCode The original code
     * @param udiff The unified diff content
     */
    public async generateDiffSvg(
        originalCode: string,
        udiff: string
    ): Promise<{
        svgImage: vscode.Uri
        startLine: number
        newCode: string
        addedCharacterCount: number
        deletedCharacterCount: number
    }> {
        const { newCode, addedCharacterCount, deletedCharacterCount } = applyUnifiedDiff(originalCode, udiff)

        // Abort SVG generation if we're in web mode
        if (isWeb() || !process.versions?.node) {
            logger.info('Skipping SVG generation in web mode')
            // Return a placeholder URI and the new code
            return {
                svgImage: vscode.Uri.parse(
                    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCI+PC9zdmc+'
                ),
                startLine: 0,
                newCode: newCode,
                addedCharacterCount: 0,
                deletedCharacterCount: 0,
            }
        }
        // Import required libraries - make sure we load svgdom before svg.js
        // These need to be imported in sequence, not in parallel, to avoid initialization issues
        const { createSVGWindow } = await import('svgdom')

        // Only import svg.js after svgdom is fully initialized
        let svgjs
        let SVG, registerWindow
        try {
            svgjs = await import('@svgdotjs/svg.js')
            SVG = svgjs.SVG
            registerWindow = svgjs.registerWindow
        } catch (error) {
            logger.error(`Failed to import @svgdotjs/svg.js: ${error}`)
            throw error
        }

        // Get editor theme info
        const currentTheme = this.getEditorTheme()

        // Get edit diffs with highlight
        const diffWithHighlight = this.getHighlightEdit(originalCode.split('\n'), newCode.split('\n'))

        // Create SVG window, document, and container
        const window = createSVGWindow()
        const document = window.document
        registerWindow(window, document)
        const draw = SVG(document.documentElement) as any

        // Calculate dimensions based on code content
        const diffLines = this.getEditedLinesFromDiff(udiff)
        const { offset, editStartLine } = this.calculatePosition(
            originalCode.split('\n'),
            newCode.split('\n'),
            diffLines,
            currentTheme
        )
        const { width, height } = this.calculateDimensions(diffLines, currentTheme)
        draw.size(width + offset, height)

        // Generate CSS for syntax highlighting based on theme
        const styles = this.generateStyles(currentTheme)

        // Generate HTML content with syntax highlighting
        const htmlContent = this.generateHtmlContent(diffWithHighlight, styles, offset)

        // Create foreignObject to embed HTML
        const foreignObject = draw.foreignObject(width + offset, height)
        foreignObject.node.innerHTML = htmlContent.trim()

        // Convert SVG to data URI
        const svgData = draw.svg()
        const svgResult = `data:image/svg+xml;base64,${Buffer.from(svgData).toString('base64')}`

        return {
            svgImage: vscode.Uri.parse(svgResult),
            startLine: editStartLine,
            newCode: newCode,
            addedCharacterCount,
            deletedCharacterCount,
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
        const height = totalLines * currentTheme.lingHeight + 20 // +10 for padding TODO, change to 10

        return { width, height }
    }

    private generateStyles(theme: editorThemeInfo): string {
        // Generate CSS styles based on editor theme
        const fontSize = theme.fontSize
        const headerFrontSize = Math.ceil(fontSize * 0.66)
        const lineHeight = theme.lingHeight
        const foreground = theme.foreground || '#d4d4d4'
        const background = theme.background || '#1e1e1e'
        const bordeColor = theme.foreground || '#d4d4d4'
        const diffRemoved = theme.diffRemoved || 'rgba(255, 0, 0, 0.2)'
        const diffAdded = 'rgba(72, 128, 72, 0.52)'
        return `
            .code-container {
                font-family: ${'monospace'};
                color: ${foreground};
                font-size: ${fontSize}px;
                line-height: ${lineHeight}px;
                background-color: ${background};
                border: 1px solid ${bordeColor}40;
                border-radius: 1px;
                padding: 1px;
            }
            .diff-header {
                color: ${theme.foreground || '#d4d4d4'};
                margin: 0;
                font-size: ${headerFrontSize}px;
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
     * Extract added lines from the unified diff
     * Only lines marked as added (+) in the diff will be included
     */
    private getEditedLinesFromDiff(unifiedDiff: string): string[] {
        const addedLines: string[] = []
        const diffLines = unifiedDiff.split('\n')

        // Find all hunks in the diff
        const hunkStarts = diffLines
            .map((line, index) => (line.startsWith('@@ ') ? index : -1))
            .filter((index) => index !== -1)

        // Process each hunk to find added lines
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
                // Only include lines that were added (start with '+')
                if (diffLines[i].startsWith('+')) {
                    const lineContent = diffLines[i].substring(1)
                    addedLines.push(lineContent)
                }
                i++
            }
        }

        return addedLines
    }

    private getHighlightEdit(originalLines: string[], newLines: string[]): string[] {
        const result: string[] = []

        // Get line-level diffs between original and new content
        const originalContent = originalLines.join('\n')
        const newContent = newLines.join('\n')
        const changes = diffLines(originalContent, newContent)

        // Only collect added lines for display in the SVG
        for (const part of changes) {
            if (part.added) {
                const lines = part.value.split('\n')
                for (const line of lines) {
                    // Skip empty lines that might be from the last newline
                    if (line.length > 0) {
                        result.push(`<span class="diff-changed">${this.escapeHtml(line)}</span>`)
                    }
                }
            }
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
        // Define colors for specific themes
        const themeColorMap: {
            [key: string]: { foreground: string; background: string; diffAdded: string; diffRemoved: string }
        } = {
            'Default Dark+': {
                foreground: '#d4d4d4',
                background: '#1e1e1e',
                diffAdded: 'rgba(231, 245, 231, 0.2)',
                diffRemoved: 'rgba(255, 0, 0, 0.2)',
            },
            Abyss: {
                foreground: '#ffffff',
                background: '#000c18',
                diffAdded: 'rgba(0, 255, 0, 0.2)',
                diffRemoved: 'rgba(255, 0, 0, 0.3)',
            },
            Red: {
                foreground: '#ff0000',
                background: '#330000',
                diffAdded: 'rgba(255, 100, 100, 0.2)',
                diffRemoved: 'rgba(255, 0, 0, 0.5)',
            },
            // Add more themes as needed
        }

        // Return colors for the current theme or default colors
        return (
            themeColorMap[themeName] || {
                foreground: '#000000',
                background: '#ffffff',
                diffAdded: 'rgba(198, 239, 206, 0.2)',
                diffRemoved: 'rgba(255, 199, 206, 0.5)',
            }
        )
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

        // Determine the range to consider
        const startLine = editStartLineInOldFile
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
}

interface editorThemeInfo {
    fontSize: number
    lingHeight: number
    foreground?: string
    background?: string
    diffAdded?: string
    diffRemoved?: string
}
