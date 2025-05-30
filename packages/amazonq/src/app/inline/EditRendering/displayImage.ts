/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger, setContext } from 'aws-core-vscode/shared'
import * as vscode from 'vscode'
import { diffLines } from 'diff'
import { LanguageClient } from 'vscode-languageclient'
import { CodeWhispererSession } from '../sessionManager'
import { LogInlineCompletionSessionResultsParams } from '@aws/language-server-runtimes/protocol'
import { InlineCompletionItemWithReferences } from '@aws/language-server-runtimes/protocol'
import path from 'path'
import { imageVerticalOffset } from './svgGenerator'

export class EditDecorationManager {
    private imageDecorationType: vscode.TextEditorDecorationType
    private removedCodeDecorationType: vscode.TextEditorDecorationType
    private currentImageDecoration: vscode.DecorationOptions | undefined
    private currentRemovedCodeDecorations: vscode.DecorationOptions[] = []
    private acceptHandler: (() => void) | undefined
    private rejectHandler: (() => void) | undefined
    private disposables: vscode.Disposable[] = []

    constructor() {
        this.imageDecorationType = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
        })

        this.removedCodeDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 0, 0, 0.2)',
        })
    }

    /**
     * Converts image to decoration options with specific styling
     */
    private image2decoration(image: vscode.Uri, range: vscode.Range) {
        return {
            range,
            renderOptions: {
                after: {
                    contentIconPath: image,
                    verticalAlign: 'text-top',
                    width: '100%',
                    height: 'auto',
                    margin: '1px 0',
                },
            },
            hoverMessage: new vscode.MarkdownString('Edit suggestion. Press [Tab] to accept or [Esc] to reject.'),
        }
    }

    /**
     * Highlights code that will be removed using the provided highlight ranges
     * @param editor The active text editor
     * @param startLine The line where the edit starts
     * @param highlightRanges Array of ranges specifying which parts to highlight
     * @returns Array of decoration options
     */
    private highlightRemovedLines(
        editor: vscode.TextEditor,
        startLine: number,
        highlightRanges: Array<{ line: number; start: number; end: number }>
    ): vscode.DecorationOptions[] {
        const decorations: vscode.DecorationOptions[] = []

        // Group ranges by line for more efficient processing
        const rangesByLine = new Map<number, Array<{ start: number; end: number }>>()

        // Process each range and adjust line numbers relative to document
        for (const range of highlightRanges) {
            const documentLine = startLine + range.line

            // Skip if line is out of bounds
            if (documentLine >= editor.document.lineCount) {
                continue
            }

            // Add to ranges map, grouped by line
            if (!rangesByLine.has(documentLine)) {
                rangesByLine.set(documentLine, [])
            }
            rangesByLine.get(documentLine)!.push({
                start: range.start,
                end: range.end,
            })
        }

        // Process each line with ranges
        for (const [lineNumber, ranges] of rangesByLine.entries()) {
            const lineLength = editor.document.lineAt(lineNumber).text.length

            if (ranges.length === 0) {
                continue
            }

            // Check if we should highlight the entire line
            if (ranges.length === 1 && ranges[0].start === 0 && ranges[0].end >= lineLength) {
                // Highlight entire line
                const range = new vscode.Range(
                    new vscode.Position(lineNumber, 0),
                    new vscode.Position(lineNumber, lineLength)
                )
                decorations.push({ range })
            } else {
                // Create individual decorations for each range on this line
                for (const range of ranges) {
                    // Ensure end doesn't exceed line length
                    const end = Math.min(range.end, lineLength)
                    if (range.start < end) {
                        const vsRange = new vscode.Range(
                            new vscode.Position(lineNumber, range.start),
                            new vscode.Position(lineNumber, end)
                        )
                        decorations.push({ range: vsRange })
                    }
                }
            }
        }

        return decorations
    }

    /**
     * Displays an edit suggestion as an SVG image in the editor and highlights removed code
     */
    public displayEditSuggestion(
        editor: vscode.TextEditor,
        svgImage: vscode.Uri,
        startLine: number,
        onAccept: () => void,
        onReject: () => void,
        originalCode: string,
        newCode: string,
        originalCodeHighlightRanges: Array<{ line: number; start: number; end: number }>
    ): void {
        // Clear any existing decorations
        this.registerCommandHandlers()
        this.clearDecorations(editor)

        // Set context to enable the Tab key handler
        void setContext('amazonq.editSuggestionActive' as any, true)

        // Store handlers
        this.acceptHandler = onAccept
        this.rejectHandler = onReject

        // Get the line text to determine the end position
        const lineText = editor.document.lineAt(Math.max(0, startLine - imageVerticalOffset)).text
        const endPosition = new vscode.Position(Math.max(0, startLine - imageVerticalOffset), lineText.length)
        const range = new vscode.Range(endPosition, endPosition)

        // Create decoration options using the existing image2decoration function
        this.currentImageDecoration = this.image2decoration(svgImage, range)

        // Apply image decoration
        editor.setDecorations(this.imageDecorationType, [this.currentImageDecoration])

        // Highlight removed code with red background using the provided ranges
        this.currentRemovedCodeDecorations = this.highlightRemovedLines(editor, startLine, originalCodeHighlightRanges)
        editor.setDecorations(this.removedCodeDecorationType, this.currentRemovedCodeDecorations)
    }

    /**
     * Clears all edit suggestion decorations
     */
    public clearDecorations(editor: vscode.TextEditor): void {
        editor.setDecorations(this.imageDecorationType, [])
        editor.setDecorations(this.removedCodeDecorationType, [])
        this.currentImageDecoration = undefined
        this.currentRemovedCodeDecorations = []
        this.acceptHandler = undefined
        this.rejectHandler = undefined
        // Clear context to allow normal Tab key behavior
        void setContext('amazonq.editSuggestionActive' as any, false)
    }

    /**
     * Registers command handlers for accepting/rejecting suggestions
     */
    public registerCommandHandlers(): void {
        // Register Tab key handler for accepting suggestion
        const acceptDisposable = vscode.commands.registerCommand('aws.amazonq.inline.acceptEdit', () => {
            if (this.acceptHandler) {
                this.acceptHandler()
            }
        })
        this.disposables.push(acceptDisposable)

        // Register Esc key handler for rejecting suggestion
        const rejectDisposable = vscode.commands.registerCommand('aws.amazonq.inline.rejectEdit', () => {
            if (this.rejectHandler) {
                this.rejectHandler()
            }
        })
        this.disposables.push(rejectDisposable)
    }

    /**
     * Disposes resources
     */
    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
        this.imageDecorationType.dispose()
        this.removedCodeDecorationType.dispose()
    }
}

// Create a singleton instance of the decoration manager
export const decorationManager = new EditDecorationManager()

/**
 * Function to replace editor's content with new code
 */
function replaceEditorContent(editor: vscode.TextEditor, newCode: string): void {
    const document = editor.document
    const fullRange = new vscode.Range(
        0,
        0,
        document.lineCount - 1,
        document.lineAt(document.lineCount - 1).text.length
    )

    void editor.edit((editBuilder) => {
        editBuilder.replace(fullRange, newCode)
    })
}

/**
 * Calculates the end position of the actual edited content by finding the last changed part
 */
function getEndOfEditPosition(originalCode: string, newCode: string): vscode.Position {
    const changes = diffLines(originalCode, newCode)
    let lineOffset = 0

    // Track the end position of the last added chunk
    let lastChangeEndLine = 0
    let lastChangeEndColumn = 0
    let foundAddedContent = false

    for (const part of changes) {
        if (part.added) {
            foundAddedContent = true

            // Calculate lines in this added part
            const lines = part.value.split('\n')
            const linesCount = lines.length

            // Update position to the end of this added chunk
            lastChangeEndLine = lineOffset + linesCount - 1

            // Get the length of the last line in this added chunk
            lastChangeEndColumn = lines[linesCount - 1].length
        }

        // Update line offset (skip removed parts)
        if (!part.removed) {
            const partLineCount = part.value.split('\n').length
            lineOffset += partLineCount - 1
        }
    }

    // If we found added content, return position at the end of the last addition
    if (foundAddedContent) {
        return new vscode.Position(lastChangeEndLine, lastChangeEndColumn)
    }

    // Fallback to current cursor position if no changes were found
    const editor = vscode.window.activeTextEditor
    return editor ? editor.selection.active : new vscode.Position(0, 0)
}

/**
 * Helper function to display SVG decorations
 */
export async function displaySvgDecoration(
    editor: vscode.TextEditor,
    svgImage: vscode.Uri,
    startLine: number,
    newCode: string,
    originalCodeHighlightRanges: Array<{ line: number; start: number; end: number }>,
    session: CodeWhispererSession,
    languageClient: LanguageClient,
    item: InlineCompletionItemWithReferences
) {
    const originalCode = editor.document.getText()

    decorationManager.displayEditSuggestion(
        editor,
        svgImage,
        startLine,
        () => {
            // Handle accept
            getLogger().info('Edit suggestion accepted')

            // Replace content
            replaceEditorContent(editor, newCode)

            // Move cursor to end of the actual changed content
            const endPosition = getEndOfEditPosition(originalCode, newCode)
            editor.selection = new vscode.Selection(endPosition, endPosition)

            // Move cursor to end of the actual changed content
            editor.selection = new vscode.Selection(endPosition, endPosition)

            decorationManager.clearDecorations(editor)
            const params: LogInlineCompletionSessionResultsParams = {
                sessionId: session.sessionId,
                completionSessionResult: {
                    [item.itemId]: {
                        seen: true,
                        accepted: true,
                        discarded: false,
                    },
                },
                totalSessionDisplayTime: Date.now() - session.requestStartTime,
                firstCompletionDisplayLatency: session.firstCompletionDisplayLatency,
                isInlineEdit: true,
            }
            languageClient.sendNotification('aws/logInlineCompletionSessionResults', params)
            decorationManager.dispose()
        },
        () => {
            // Handle reject
            getLogger().info('Edit suggestion rejected')
            decorationManager.clearDecorations(editor)
            const params: LogInlineCompletionSessionResultsParams = {
                sessionId: session.sessionId,
                completionSessionResult: {
                    [item.itemId]: {
                        seen: true,
                        accepted: false,
                        discarded: false,
                    },
                },
                isInlineEdit: true,
            }
            languageClient.sendNotification('aws/logInlineCompletionSessionResults', params)
            decorationManager.dispose()
        },
        originalCode,
        newCode,
        originalCodeHighlightRanges
    )
}

export function deactivate() {
    decorationManager.dispose()
}

let decorationType: vscode.TextEditorDecorationType | undefined

export function decorateLinesWithGutterIcon(lineNumbers: number[]) {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        return
    }

    // Dispose previous decoration if it exists
    if (decorationType) {
        decorationType.dispose()
    }

    // Create a new gutter decoration with a small green dot
    decorationType = vscode.window.createTextEditorDecorationType({
        gutterIconPath: vscode.Uri.file(
            path.join(__dirname, 'media', 'green-dot.svg') // put your svg file in a `media` folder
        ),
        gutterIconSize: 'contain',
    })

    const decorations: vscode.DecorationOptions[] = lineNumbers.map((line) => ({
        range: new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, 0)),
    }))

    editor.setDecorations(decorationType, decorations)
}
