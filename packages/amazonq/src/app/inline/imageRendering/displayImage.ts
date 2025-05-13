/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { nepLogger } from './imageRenderer'

export class EditDecorationManager {
    private decorationType: vscode.TextEditorDecorationType
    private currentDecoration: vscode.DecorationOptions | undefined
    private acceptHandler: (() => void) | undefined
    private rejectHandler: (() => void) | undefined

    constructor() {
        this.decorationType = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
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
     * Displays an edit suggestion as an SVG image in the editor
     */
    public displayEditSuggestion(
        editor: vscode.TextEditor,
        svgImage: vscode.Uri,
        startLine: number,
        onAccept: () => void,
        onReject: () => void
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
        this.currentDecoration = this.image2decoration(svgImage, range)

        // Apply decoration
        editor.setDecorations(this.decorationType, [this.currentDecoration])

        // Register command handlers for accept/reject
        this.registerCommandHandlers()
    }

    /**
     * Clears all edit suggestion decorations
     */
    public clearDecorations(editor: vscode.TextEditor): void {
        editor.setDecorations(this.decorationType, [])
        this.currentDecoration = undefined
        this.acceptHandler = undefined
        this.rejectHandler = undefined
    }

    /**
     * Registers command handlers for accepting/rejecting suggestions
     */
    private registerCommandHandlers(): void {
        // Register Tab key handler for accepting suggestion
        const acceptDisposable = vscode.commands.registerCommand('amazonq.acceptEditSuggestion', () => {
            if (this.acceptHandler) {
                this.acceptHandler()
            }
        })

        // Register Esc key handler for rejecting suggestion
        const rejectDisposable = vscode.commands.registerCommand('amazonq.rejectEditSuggestion', () => {
            if (this.rejectHandler) {
                this.rejectHandler()
            }
        })

        // Automatically dispose after use
        setTimeout(() => {
            acceptDisposable.dispose()
            rejectDisposable.dispose()
        }, 30000) // Auto-dispose after 30 seconds
    }

    /**
     * Disposes resources
     */
    public dispose(): void {
        this.decorationType.dispose()
    }
}

// Create a singleton instance of the decoration manager
export const decorationManager = new EditDecorationManager()

/**
 * Helper function to display SVG decorations
 */
export async function displaySvgDecoration(editor: vscode.TextEditor, svgImage: vscode.Uri, startLine: number) {
    decorationManager.displayEditSuggestion(
        editor,
        svgImage,
        startLine,
        () => {
            // Handle accept - delegate to the inline completion accept
            nepLogger.info('Edit suggestion accepted')
            void vscode.commands.executeCommand('aws.amazonq.acceptInline').then(() => {
                decorationManager.clearDecorations(editor)
            })
        },
        () => {
            // Handle reject - delegate to the inline completion reject
            nepLogger.info('Edit suggestion rejected')
            void vscode.commands.executeCommand('aws.amazonq.rejectCodeSuggestion').then(() => {
                decorationManager.clearDecorations(editor)
            })
        }
    )
}

// Make sure to dispose of the decoration manager when the extension deactivates
export function deactivate() {
    decorationManager.dispose()
}
