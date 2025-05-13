/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { diffChars } from 'diff'
import * as vscode from 'vscode'

export class SvgGenerationService {
    /**
     * Generates an SVG image representing a code diff
     * @param originalCode The original code
     * @param newCode The new code with edits
     * @param language The programming language
     * @param theme The editor theme information
     * @param offSet The margin to add to the left of the image
     */
    public async generateDiffSvg(
        originalCode: string,
        newCode: string,
        language: string
    ): Promise<{ svgImage: vscode.Uri; startLine: number }> {
        // Import required libraries
        const { createSVGWindow } = await import('svgdom')
        const { SVG, registerWindow } = await import('@svgdotjs/svg.js')

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
        const diffLines = this.getEditedLines(originalCode.split('\n'), newCode.split('\n'))
        const { offset, editStartLine } = this.calculateOffset(
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
        const htmlContent = this.generateHtmlContent(diffWithHighlight, language, styles, offset)

        // Create foreignObject to embed HTML
        const foreignObject = draw.foreignObject(width + offset, height)
        foreignObject.node.innerHTML = htmlContent.trim()

        // Convert SVG to data URI
        const svgData = draw.svg()
        const svgResult = `data:image/svg+xml;base64,${Buffer.from(svgData).toString('base64')}`

        return {
            svgImage: vscode.Uri.parse(svgResult),
            startLine: editStartLine,
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
        const height = totalLines * currentTheme.lingHeight + 10 // +10 for padding

        return { width, height }
    }

    private generateStyles(theme: editorThemeInfo): string {
        // Generate CSS styles based on editor theme
        const fontSize = theme.fontSize
        const headerFrontSize = Math.ceil(fontSize * 0.66)
        const lineHeight = theme.lingHeight
        const foreground = theme.foreground || '#d4d4d4'
        const background = theme.background || '#1e1e1e'
        const diffRemoved = theme.diffRemoved || 'rgba(255, 0, 0, 0.2)'
        const diffAdded = theme.diffAdded || 'rgba(231, 245, 231, 0.31)'
        return `
            .code-container {
                font-family: ${'monospace'};
                color: ${foreground};
                font-size: ${fontSize}px;
                line-height: ${lineHeight}px;
                background-color: ${background};
                border: 1px solid rgba(239, 231, 231, 0.51);
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
                text-decoration: line-through;
                opacity: 0.7;
            }
            .diff-changed {
                white-space: pre-wrap; /* Preserve whitespace */
                background-color: ${diffAdded};
            }
        `
    }

    private generateHtmlContent(diffLines: string[], language: string, styles: string, offSet: number): string {
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

    private getEditedLines(originalLines: string[], newLines: string[]): string[] {
        const editedLines: string[] = []

        const maxLength = Math.max(originalLines.length, newLines.length)
        for (let i = 0; i < maxLength; i++) {
            if (originalLines[i] !== newLines[i]) {
                if (newLines[i] !== undefined) {
                    editedLines.push(newLines[i])
                }
            }
        }

        return editedLines
    }

    private getHighlightEdit(originalLines: string[], newLines: string[]): string[] {
        const diffLines: string[] = []

        const maxLength = Math.max(originalLines.length, newLines.length)
        for (let i = 0; i < maxLength; i++) {
            const originalLine = originalLines[i] || ''
            const newLine = newLines[i] || ''

            if (originalLine !== newLine) {
                if (newLines[i] !== undefined && originalLines[i] !== undefined) {
                    // Use diff library to get character-level changes
                    const changes = diffChars(originalLine, newLine)
                    const diffLine = changes
                        .map((part) => {
                            const escapedText = this.escapeHtml(part.value)
                            if (part.added) {
                                return `<span class="diff-changed">${escapedText}</span>`
                            } else if (part.removed) {
                                return `<span class="diff-removed">${escapedText}</span>`
                            } else {
                                return escapedText
                            }
                        })
                        .join('')
                    diffLines.push(diffLine)
                } else if (newLines[i] !== undefined) {
                    // Completely new line
                    diffLines.push(`<span class="diff-changed">${this.escapeHtml(newLines[i])}</span>`)
                }
            }
        }

        return diffLines
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
                diffAdded: 'rgba(231, 245, 231, 0.31)',
                diffRemoved: 'rgba(255, 0, 0, 0.2)',
            },
            Abyss: {
                foreground: '#ffffff',
                background: '#000c18',
                diffAdded: 'rgba(0, 255, 0, 0.3)',
                diffRemoved: 'rgba(255, 0, 0, 0.3)',
            },
            Red: {
                foreground: '#ff0000',
                background: '#330000',
                diffAdded: 'rgba(255, 100, 100, 0.3)',
                diffRemoved: 'rgba(255, 0, 0, 0.5)',
            },
            // Add more themes as needed
        }

        // Return colors for the current theme or default colors
        return (
            themeColorMap[themeName] || {
                foreground: '#000000',
                background: '#ffffff',
                diffAdded: 'rgba(198, 239, 206, 0.5)',
                diffRemoved: 'rgba(255, 199, 206, 0.5)',
            }
        )
    }

    private calculateOffset(
        originalLines: string[],
        newLines: string[],
        diffLines: string[],
        theme: editorThemeInfo
    ): { offset: number; editStartLine: number } {
        // Determine the starting line of the edit in the original file
        let editStartLineInOldFile = 0
        const maxLength = Math.min(originalLines.length, newLines.length)

        for (let i = 0; i < maxLength; i++) {
            if (originalLines[i] !== newLines[i]) {
                editStartLineInOldFile = i
                break
            }
        }

        // Determine the range to consider
        const startLine = editStartLineInOldFile
        const endLine = Math.min(editStartLineInOldFile + diffLines.length, originalLines.length)

        // Find the longest line within the specified range
        let maxLineLength = 0
        for (let i = startLine; i < endLine + 1; i++) {
            const lineLength = originalLines[i].length
            if (lineLength > maxLineLength) {
                maxLineLength = lineLength
            }
        }

        // Calculate the offset based on the longest line and the starting line length
        const startLineLength = originalLines[startLine]?.length || 0
        const offset = (maxLineLength - startLineLength) * theme.fontSize * 0.7

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
