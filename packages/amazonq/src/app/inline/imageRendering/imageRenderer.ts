/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { displaySvgDecoration } from './displayImage'
import { SvgGenerationService } from './svgGenerator'
import { getLogger } from 'aws-core-vscode/shared'

export const nepLogger = getLogger('nextEditPrediction')

export async function activate(context: vscode.ExtensionContext) {
    // no need to register the POC command anymore, as we'll be integrating directly with inline completions
}

// unused, but this is how we get the color info from the editor.
// function getThemeSettings() {
//     const theme = vscode.workspace.getConfiguration('workbench').get('colorTheme')
//     const tokenColors = vscode.workspace.getConfiguration('editor').get('tokenColorCustomizations')
//     // eslint-disable-next-line aws-toolkits/no-json-stringify-in-log
//     nepLogger.info(`Token Colors: ${JSON.stringify(tokenColors)}`)
//     const workbenchColors = vscode.workspace.getConfiguration('workbench').get('colorCustomizations')
//     // eslint-disable-next-line aws-toolkits/no-json-stringify-in-log
//     nepLogger.info(`Custom Colors: ${JSON.stringify(workbenchColors)}`)
//     return theme
// }

/**
 * Parses a unified diff format into old and new content strings and determines the starting line
 * @param diffContent Unified diff format string
 * @returns Object containing old and new content, and parsed line information
 */
export function parseUnifiedDiff(diffContent: string): {
    oldContent: string
    newContent: string
    startLineNumber?: number
} {
    // Initialize empty strings for old and new content
    let oldContent = ''
    let newContent = ''
    let startLineNumber: number | undefined = undefined

    // Skip file headers and find the hunk header
    const lines = diffContent.split('\n')
    const contentLines: string[] = []
    let inContent = false
    let hunkHeader = ''

    // Extract lines and process the hunk header
    for (const line of lines) {
        // Skip file path headers
        if (line.startsWith('---') || line.startsWith('+++')) {
            continue
        }

        // Process hunk header to extract line numbers
        if (line.startsWith('@@')) {
            inContent = true
            hunkHeader = line

            // Parse the line numbers from the hunk header
            // Format examples:
            // @@ -20,13 +20,11 @@
            // @@ -20,13 +20,11 @@ some context text
            const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
            if (match) {
                startLineNumber = parseInt(match[1], 10)
                nepLogger.info(`Found start line ${startLineNumber} from hunk header: ${hunkHeader}`)
            } else {
                nepLogger.warn(`Failed to parse line numbers from hunk header: ${hunkHeader}`)
            }

            // Don't add the hunk header to content lines
            continue
        }

        if (inContent) {
            contentLines.push(line)
        }
    }

    // Process the diff content
    const oldLines: string[] = []
    const newLines: string[] = []

    // Build the content for the old and new versions
    for (const line of contentLines) {
        if (line.startsWith('-')) {
            // Line removed from original
            oldLines.push(line.substring(1))
        } else if (line.startsWith('+')) {
            // Line added in new content
            newLines.push(line.substring(1))
        } else {
            // Context line (exists in both old and new)
            oldLines.push(line)
            newLines.push(line)
        }
    }

    // Join lines into string content
    oldContent = oldLines.join('\n')
    newContent = newLines.join('\n')

    nepLogger.info(
        `Parsed diff with ${oldLines.length} old lines and ${newLines.length} new lines. Start line: ${startLineNumber}`
    )
    return { oldContent, newContent, startLineNumber }
}

/**
 * Renders a visual diff from unified diff text
 * @param editor The active text editor
 * @param diffText Unified diff format as a string
 * @param language The programming language for syntax highlighting
 * @returns Promise that resolves when the SVG is displayed
 */
export async function renderDiffFromText(
    editor: vscode.TextEditor | undefined,
    diffText: string,
    language: string
): Promise<void> {
    if (!editor) {
        return
    }

    try {
        const svgGenerationService = new SvgGenerationService()

        // Parse the unified diff
        const { oldContent, newContent, startLineNumber } = parseUnifiedDiff(diffText)

        nepLogger.info(
            `Rendering diff for language: ${language}, old content: ${oldContent.length} chars, new content: ${newContent.length} chars`
        )

        // Generate SVG image using the parsed content
        const generatedSvg = await svgGenerationService.generateDiffSvg(oldContent, newContent, language)

        // Calculate the correct start line for display
        // In diff format line numbers are 1-based, but vscode uses 0-based indices
        // Subtract 1 from the parsed start line to get the correct vscode line number
        let startLine = generatedSvg.startLine // Default value from SVG generation

        if (startLineNumber !== undefined) {
            // Line numbers in diff are 1-based, VS Code is 0-based
            startLine = startLineNumber - 1

            // Ensure startLine is within document bounds
            const documentLineCount = editor.document.lineCount
            if (startLine >= documentLineCount) {
                nepLogger.warn(
                    `Calculated start line ${startLine} exceeds document line count ${documentLineCount}, adjusting`
                )
                startLine = Math.max(0, documentLineCount - 1)
            }
        }

        nepLogger.info(`Using startLine: ${startLine} for display`)

        nepLogger.info(`SVG image generated successfully for inline edit. Using start line: ${startLine}`)
        if (generatedSvg.svgImage) {
            // Display the SVG image
            await displaySvgDecoration(editor, generatedSvg.svgImage, startLine)
        } else {
            nepLogger.error('SVG image generation returned an empty result.')
        }
    } catch (error) {
        nepLogger.error(`Error generating SVG image: ${error}`)
    }
}
