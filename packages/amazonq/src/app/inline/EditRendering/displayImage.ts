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
     * Highlights lines that will be removed with a red background
     */
    private highlightRemovedLines(
        editor: vscode.TextEditor,
        originalCode: string,
        newCode: string
    ): vscode.DecorationOptions[] {
        const decorations: vscode.DecorationOptions[] = []
        const changes = diffLines(originalCode, newCode)

        let lineOffset = 0

        for (const part of changes) {
            if (part.removed) {
                const lines = part.value.split('\n')
                for (let i = 0; i < lines.length; i++) {
                    // Skip empty lines that might be from the last newline
                    if (lines[i].length > 0 || i < lines.length - 1) {
                        const lineNumber = lineOffset + i
                        if (lineNumber < editor.document.lineCount) {
                            const range = new vscode.Range(
                                new vscode.Position(lineNumber, 0),
                                new vscode.Position(lineNumber, editor.document.lineAt(lineNumber).text.length)
                            )
                            decorations.push({ range })
                        }
                    }
                }
            }

            // Update line offset for unchanged and added parts (not for removed parts)
            if (!part.removed) {
                lineOffset += part.value.split('\n').length - 1
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
        removedHighlights?: vscode.DecorationOptions[]
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
        const lineText = editor.document.lineAt(startLine).text
        const endPosition = new vscode.Position(startLine, lineText.length)
        const range = new vscode.Range(endPosition, endPosition)

        // Create decoration options using the existing image2decoration function
        this.currentImageDecoration = this.image2decoration(svgImage, range)

        // Apply image decoration
        editor.setDecorations(this.imageDecorationType, [this.currentImageDecoration])

        // Highlight removed parts with red background - use provided highlights if available
        if (removedHighlights && removedHighlights.length > 0) {
            this.currentRemovedCodeDecorations = removedHighlights
        } else {
            // Fall back to line-level highlights if no char-level highlights provided
            this.currentRemovedCodeDecorations = this.highlightRemovedLines(editor, originalCode, newCode)
        }
        editor.setDecorations(this.removedCodeDecorationType, this.currentRemovedCodeDecorations)

        // Register command handlers for accept/reject
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
            // Safely calculate line count from the part's value
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
    session: CodeWhispererSession,
    languageClient: LanguageClient,
    item: InlineCompletionItemWithReferences,
    addedCharacterCount: number,
    deletedCharacterCount: number
) {
    const originalCode = editor.document.getText()

    decorationManager.displayEditSuggestion(
        editor,
        svgImage,
        startLine,
        () => {
            // Handle accept
            getLogger().info('Edit suggestion accepted')

            // Calculate cursor position before replacing content
            const endPosition = getEndOfEditPosition(originalCode, newCode)

            // Replace content
            replaceEditorContent(editor, newCode)

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
                // TODO: Update LogInlineCompletionSessionResultsParams interface to include these properties
                // addedCharacterCount: addedCharacterCount,
                // deletedCharacterCount: deletedCharacterCount,
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
                // TODO: Update LogInlineCompletionSessionResultsParams interface to include these properties
                // addedCharacterCount: addedCharacterCount,
                // deletedCharacterCount: deletedCharacterCount,
            }
            languageClient.sendNotification('aws/logInlineCompletionSessionResults', params)
            decorationManager.dispose()
        },
        originalCode,
        newCode
    )
}

// Make sure to dispose of the decoration manager when the extension deactivates
export function deactivate() {
    decorationManager.dispose()
}
