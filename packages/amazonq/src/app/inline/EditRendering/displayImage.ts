/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from 'aws-core-vscode/shared'
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

    constructor() {
        this.imageDecorationType = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
        })

        this.removedCodeDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 0, 0, 0.2)',
        })

        this.registerCommandHandlers()
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
        newCode: string
    ): void {
        // Clear any existing decorations
        this.clearDecorations(editor)

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

        // Highlight removed lines with red background
        this.currentRemovedCodeDecorations = this.highlightRemovedLines(editor, originalCode, newCode)
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
            replaceEditorContent(editor, newCode)
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
                addedCharacterCount: addedCharacterCount,
                deletedCharacterCount: deletedCharacterCount,
            }
            languageClient.sendNotification('aws/logInlineCompletionSessionResults', params)
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
                addedCharacterCount: addedCharacterCount,
                deletedCharacterCount: deletedCharacterCount,
            }
            languageClient.sendNotification('aws/logInlineCompletionSessionResults', params)
        },
        originalCode,
        newCode
    )
}

// Make sure to dispose of the decoration manager when the extension deactivates
export function deactivate() {
    decorationManager.dispose()
}
