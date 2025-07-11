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
import { AmazonQInlineCompletionItemProvider } from '../completion'
import { vsCodeState } from 'aws-core-vscode/codewhisperer'

export class EditDecorationManager {
    private imageDecorationType: vscode.TextEditorDecorationType
    private removedCodeDecorationType: vscode.TextEditorDecorationType
    private currentImageDecoration: vscode.DecorationOptions | undefined
    private currentRemovedCodeDecorations: vscode.DecorationOptions[] = []
    private acceptHandler: (() => void) | undefined
    private rejectHandler: (() => void) | undefined

    constructor() {
        this.registerCommandHandlers()
        this.imageDecorationType = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
        })

        this.removedCodeDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 0, 0, 0.2)',
        })
    }

    private imageToDecoration(image: vscode.Uri, range: vscode.Range) {
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
    public async displayEditSuggestion(
        editor: vscode.TextEditor,
        svgImage: vscode.Uri,
        startLine: number,
        onAccept: () => Promise<void>,
        onReject: () => Promise<void>,
        originalCode: string,
        newCode: string,
        originalCodeHighlightRanges: Array<{ line: number; start: number; end: number }>
    ): Promise<void> {
        await this.clearDecorations(editor)

        await setContext('aws.amazonq.editSuggestionActive' as any, true)

        this.acceptHandler = onAccept
        this.rejectHandler = onReject

        // Get the line text to determine the end position
        const lineText = editor.document.lineAt(Math.max(0, startLine - imageVerticalOffset)).text
        const endPosition = new vscode.Position(Math.max(0, startLine - imageVerticalOffset), lineText.length)
        const range = new vscode.Range(endPosition, endPosition)

        this.currentImageDecoration = this.imageToDecoration(svgImage, range)

        // Apply image decoration
        editor.setDecorations(this.imageDecorationType, [this.currentImageDecoration])

        // Highlight removed code with red background
        this.currentRemovedCodeDecorations = this.highlightRemovedLines(editor, startLine, originalCodeHighlightRanges)
        editor.setDecorations(this.removedCodeDecorationType, this.currentRemovedCodeDecorations)
    }

    /**
     * Clears all edit suggestion decorations
     */
    public async clearDecorations(editor: vscode.TextEditor): Promise<void> {
        editor.setDecorations(this.imageDecorationType, [])
        editor.setDecorations(this.removedCodeDecorationType, [])
        this.currentImageDecoration = undefined
        this.currentRemovedCodeDecorations = []
        this.acceptHandler = undefined
        this.rejectHandler = undefined
        await setContext('aws.amazonq.editSuggestionActive' as any, false)
    }

    /**
     * Registers command handlers for accepting/rejecting suggestions
     */
    public registerCommandHandlers(): void {
        // Register Tab key handler for accepting suggestion
        vscode.commands.registerCommand('aws.amazonq.inline.acceptEdit', () => {
            if (this.acceptHandler) {
                this.acceptHandler()
            }
        })

        // Register Esc key handler for rejecting suggestion
        vscode.commands.registerCommand('aws.amazonq.inline.rejectEdit', () => {
            if (this.rejectHandler) {
                this.rejectHandler()
            }
        })
    }

    /**
     * Disposes resources
     */
    public dispose(): void {
        this.imageDecorationType.dispose()
        this.removedCodeDecorationType.dispose()
    }

    // Use process-wide singleton to prevent multiple instances on Windows
    static readonly decorationManagerKey = Symbol.for('aws.amazonq.decorationManager')

    static getDecorationManager(): EditDecorationManager {
        const globalObj = global as any
        if (!globalObj[this.decorationManagerKey]) {
            globalObj[this.decorationManagerKey] = new EditDecorationManager()
        }
        return globalObj[this.decorationManagerKey]
    }
}

export const decorationManager = EditDecorationManager.getDecorationManager()

/**
 * Function to replace editor's content with new code
 */
async function replaceEditorContent(editor: vscode.TextEditor, newCode: string): Promise<void> {
    const document = editor.document
    const fullRange = new vscode.Range(
        0,
        0,
        document.lineCount - 1,
        document.lineAt(document.lineCount - 1).text.length
    )

    await editor.edit((editBuilder) => {
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
    item: InlineCompletionItemWithReferences,
    inlineCompletionProvider?: AmazonQInlineCompletionItemProvider
) {
    const originalCode = editor.document.getText()

    await decorationManager.displayEditSuggestion(
        editor,
        svgImage,
        startLine,
        async () => {
            // Handle accept
            getLogger().info('Edit suggestion accepted')

            // Replace content
            try {
                vsCodeState.isCodeWhispererEditing = true
                await replaceEditorContent(editor, newCode)
            } finally {
                vsCodeState.isCodeWhispererEditing = false
            }

            // Move cursor to end of the actual changed content
            const endPosition = getEndOfEditPosition(originalCode, newCode)
            editor.selection = new vscode.Selection(endPosition, endPosition)

            // Move cursor to end of the actual changed content
            editor.selection = new vscode.Selection(endPosition, endPosition)

            await decorationManager.clearDecorations(editor)
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
            if (inlineCompletionProvider) {
                await inlineCompletionProvider.provideInlineCompletionItems(
                    editor.document,
                    endPosition,
                    {
                        triggerKind: vscode.InlineCompletionTriggerKind.Automatic,
                        selectedCompletionInfo: undefined,
                    },
                    new vscode.CancellationTokenSource().token,
                    { emitTelemetry: false, showUi: false, editsStreakToken: session.editsStreakPartialResultToken }
                )
            }
        },
        async () => {
            // Handle reject
            getLogger().info('Edit suggestion rejected')
            await decorationManager.clearDecorations(editor)
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
