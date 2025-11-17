/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { displaySvgDecoration, decorationManager } from './displayImage'
import { SvgGenerationService } from './svgGenerator'
import { getContext, getLogger } from 'aws-core-vscode/shared'
import { BaseLanguageClient } from 'vscode-languageclient'
import { InlineCompletionItemWithReferences } from '@aws/language-server-runtimes/protocol'
import { CodeWhispererSession } from '../sessionManager'
import type { AmazonQInlineCompletionItemProvider } from '../completion'
import { vsCodeState } from 'aws-core-vscode/codewhisperer'
import { applyPatch, createPatch } from 'diff'
import { EditSuggestionState } from '../editSuggestionState'
import { debounce } from 'aws-core-vscode/utils'

const autoRejectEditCursorDistance = 25
const maxPrefixRetryCharDiff = 5
const rerenderDeboucneInMs = 500

enum RejectReason {
    DocumentChange = 'Invalid patch due to document change',
    NotApplicableToOriginal = 'ApplyPatch fail for original code',
    MaxRetry = 'Already retry 10 times',
}

export class EditsSuggestionSvg {
    private readonly logger = getLogger('nextEditPrediction')
    private documentChangedListener: vscode.Disposable | undefined
    private cursorChangedListener: vscode.Disposable | undefined

    private startLine = 0

    private documentChangeTrace = {
        contentChanged: '',
        count: 0,
    }

    constructor(
        private suggestion: InlineCompletionItemWithReferences,
        private readonly editor: vscode.TextEditor,
        private readonly languageClient: BaseLanguageClient,
        private readonly session: CodeWhispererSession,
        private readonly inlineCompletionProvider?: AmazonQInlineCompletionItemProvider
    ) {}

    async show(patchedSuggestion?: InlineCompletionItemWithReferences) {
        if (!this.editor) {
            this.logger.error(`attempting to render an edit suggestion while editor is undefined`)
            return
        }

        const item = patchedSuggestion ? patchedSuggestion : this.suggestion

        try {
            const svgGenerationService = new SvgGenerationService()
            // Generate your SVG image with the file contents
            const currentFile = this.editor.document.uri.fsPath
            const { svgImage, startLine, newCode, originalCodeHighlightRange } =
                await svgGenerationService.generateDiffSvg(currentFile, this.suggestion.insertText as string)

            // For cursorChangeListener to access
            this.startLine = startLine

            if (newCode.length === 0) {
                this.logger.warn('not able to apply provided edit suggestion, skip rendering')
                return
            }

            if (svgImage) {
                const documentChangedListener = (this.documentChangedListener ??=
                    vscode.workspace.onDidChangeTextDocument(async (e) => {
                        await this.onDocChange(e)
                    }))

                const cursorChangedListener = (this.cursorChangedListener ??=
                    vscode.window.onDidChangeTextEditorSelection((e) => {
                        this.onCursorChange(e)
                    }))

                // display the SVG image
                await displaySvgDecoration(
                    this.editor,
                    svgImage,
                    startLine,
                    newCode,
                    originalCodeHighlightRange,
                    this.session,
                    this.languageClient,
                    item,
                    [documentChangedListener, cursorChangedListener],
                    this.inlineCompletionProvider
                )
            } else {
                this.logger.error('SVG image generation returned an empty result.')
            }
        } catch (error) {
            this.logger.error(`Error generating SVG image: ${error}`)
        }
    }

    private onCursorChange(e: vscode.TextEditorSelectionChangeEvent) {
        if (!EditSuggestionState.isEditSuggestionActive()) {
            return
        }
        if (e.textEditor !== this.editor) {
            return
        }
        const currentPosition = e.selections[0].active
        const distance = Math.abs(currentPosition.line - this.startLine)
        if (distance > autoRejectEditCursorDistance) {
            this.autoReject(`cursor position move too far away off ${autoRejectEditCursorDistance} lines`)
        }
    }

    private async onDocChange(e: vscode.TextDocumentChangeEvent) {
        if (e.contentChanges.length <= 0) {
            return
        }
        if (e.document !== this.editor.document) {
            return
        }
        if (vsCodeState.isCodeWhispererEditing) {
            return
        }
        if (getContext('aws.amazonq.editSuggestionActive') === false) {
            return
        }

        // TODO: handle multi-contentChanges scenario
        const diff = e.contentChanges[0] ? e.contentChanges[0].text : ''
        this.logger.info(`docChange sessionId=${this.session.sessionId}, contentChange=${diff}`)

        // Track document changes because we might need to hide/reject suggestions while users are typing for better UX
        this.documentChangeTrace.contentChanged += e.contentChanges[0].text
        this.documentChangeTrace.count++
        /**
         * 1. Take the diff returned by the model and apply it to the code we originally sent to the model
         * 2. Do a diff between the above code and what's currently in the editor
         * 3. Show this second diff to the user as the edit suggestion
         */
        // Users' file content when the request fires (best guess because the actual process happens in language server)
        const originalCode = this.session.fileContent
        const appliedToOriginal = applyPatch(originalCode, this.suggestion.insertText as string)
        try {
            if (appliedToOriginal) {
                const updatedPatch = this.patchSuggestion(appliedToOriginal)

                if (
                    this.documentChangeTrace.contentChanged.length > maxPrefixRetryCharDiff ||
                    this.documentChangeTrace.count > maxPrefixRetryCharDiff
                ) {
                    // Reject the suggestion if users've typed over 5 characters while the suggestion is shown
                    this.autoReject(RejectReason.MaxRetry)
                } else if (applyPatch(this.editor.document.getText(), updatedPatch.insertText as string) === false) {
                    this.autoReject(RejectReason.DocumentChange)
                } else {
                    // Close the previoius popup and rerender it
                    this.logger.debug(`calling rerender with suggestion\n ${updatedPatch.insertText as string}`)
                    await this.debouncedRerender(updatedPatch)
                }
            } else {
                this.autoReject(RejectReason.NotApplicableToOriginal)
            }
        } catch (e) {
            // TODO: format
            this.logger.error(`${e}`)
        }
    }

    async dispose() {
        this.documentChangedListener?.dispose()
        this.cursorChangedListener?.dispose()
        await decorationManager.clearDecorations(this.editor, [])
    }

    debouncedRerender = debounce(
        async (suggestion: InlineCompletionItemWithReferences) => await this.rerender(suggestion),
        rerenderDeboucneInMs,
        true
    )

    private async rerender(suggestion: InlineCompletionItemWithReferences) {
        await decorationManager.clearDecorations(this.editor, [])
        await this.show(suggestion)
    }

    private autoReject(reason: string) {
        function logSuggestionFailure(type: 'REJECT', reason: string, suggestionContent: string) {
            getLogger('nextEditPrediction').debug(
                `Auto ${type} edit suggestion with reason=${reason}, suggetion: ${suggestionContent}`
            )
        }

        logSuggestionFailure('REJECT', reason, this.suggestion.insertText as string)
        void vscode.commands.executeCommand('aws.amazonq.inline.rejectEdit')
    }

    private patchSuggestion(appliedToOriginal: string): InlineCompletionItemWithReferences {
        const updatedPatch = createPatch(
            this.editor.document.fileName,
            this.editor.document.getText(),
            appliedToOriginal
        )
        this.logger.info(`Update edit suggestion\n ${updatedPatch}`)
        return { ...this.suggestion, insertText: updatedPatch }
    }
}
