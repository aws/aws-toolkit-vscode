/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import path from 'path'
import { Position, TextEditor, window } from 'vscode'
import { getLogger } from '../../../shared/logger'
import { amazonQDiffScheme, amazonQTabSuffix } from '../../../shared/constants'
import { disposeOnEditorClose } from '../../../shared/utilities/editorUtilities'
import {
    applyChanges,
    createTempFileForDiff,
    getIndentedCode,
    getSelectionFromRange,
} from '../../../shared/utilities/textDocumentUtilities'
import { extractFileAndCodeSelectionFromMessage, fs, getErrorMsg, ToolkitError } from '../../../shared'

class ContentProvider implements vscode.TextDocumentContentProvider {
    constructor(private uri: vscode.Uri) {}

    provideTextDocumentContent(_uri: vscode.Uri) {
        return fs.readFileText(this.uri.fsPath)
    }
}

const chatDiffCode = 'ChatDiff'
const ChatDiffError = ToolkitError.named(chatDiffCode)

export class EditorContentController {
    /* *
     *  Insert the Amazon Q chat written code to the cursor position
     *  Add current intentation to the next few lines of the recommendation
     * @param text the raw text from Amazon Q chat
     * @param trackCodeEdit callback to track user edits
     */
    public insertTextAtCursorPosition(
        text: string,
        trackCodeEdit: (editor: TextEditor, cursorStart: Position) => void
    ) {
        const editor = window.activeTextEditor
        if (editor) {
            const cursorStart = editor.selection.active
            const indentRange = new vscode.Range(new vscode.Position(cursorStart.line, 0), cursorStart)
            // use the user editor intent if the position to the left of cursor is just space or tab
            // otherwise indent with empty space equal to the intent at this position
            let indent = editor.document.getText(indentRange)
            if (indent.trim().length !== 0) {
                indent = ' '.repeat(indent.length - indent.trimStart().length)
            }
            let textWithIndent = ''
            text.split('\n').forEach((line, index) => {
                if (index === 0) {
                    textWithIndent += line
                } else {
                    textWithIndent += '\n' + indent + line
                }
            })
            editor
                .edit((editBuilder) => {
                    editBuilder.insert(cursorStart, textWithIndent)
                })
                .then(
                    (appliedEdits) => {
                        if (appliedEdits) {
                            trackCodeEdit(editor, cursorStart)
                        }
                    },
                    (e) => {
                        getLogger().error('TextEditor.edit failed: %s', (e as Error).message)
                    }
                )
        }
    }

    /**
     * Accepts and applies a diff to a file, then closes the associated diff view tab.
     *
     * @param {any} message - The message containing diff information.
     * @returns {Promise<void>} A promise that resolves when the diff is applied and the tab is closed.
     *
     * @description
     * This method performs the following steps:
     * 1. Extracts file path and selection from the message.
     * 2. If valid file path, non-empty code, and selection are present:
     *    a. Opens the document.
     *    b. Gets the indented code to update.
     *    c. Applies the changes to the document.
     *    d. Attempts to close the diff view tab for the file.
     *
     * @throws {Error} If there's an issue opening the document or applying changes.
     */
    public async acceptDiff(message: any) {
        const errorNotification = 'Unable to Apply code changes.'
        const { filePath, selection } = extractFileAndCodeSelectionFromMessage(message)

        if (filePath && message?.code?.trim().length > 0 && selection) {
            try {
                const doc = await vscode.workspace.openTextDocument(filePath)

                const code = getIndentedCode(message, doc, selection)
                const range = getSelectionFromRange(doc, selection)
                await applyChanges(doc, range, code)

                // Sets the editor selection from the start of the given range, extending it by the number of lines in the code till the end of the last line
                const editor = await vscode.window.showTextDocument(doc)
                editor.selection = new vscode.Selection(
                    range.start,
                    new Position(range.start.line + code.split('\n').length, Number.MAX_SAFE_INTEGER)
                )

                // If vscode.diff is open for the filePath then close it.
                vscode.window.tabGroups.all.flatMap(({ tabs }) =>
                    tabs.map((tab) => {
                        if (tab.label === `${path.basename(filePath)} ${amazonQTabSuffix}`) {
                            const tabClosed = vscode.window.tabGroups.close(tab)
                            if (!tabClosed) {
                                getLogger().error(
                                    '%s: Unable to close the diff view tab for %s',
                                    chatDiffCode,
                                    tab.label
                                )
                            }
                        }
                    })
                )
            } catch (error) {
                void vscode.window.showInformationMessage(errorNotification)
                const wrappedError = ChatDiffError.chain(error, `Failed to Accept Diff`, { code: chatDiffCode })
                getLogger().error('%s: Failed to open diff view %s', chatDiffCode, getErrorMsg(wrappedError, true))
                throw wrappedError
            }
        }
    }

    /**
     * Displays a diff view comparing proposed changes with the existing file.
     *
     * How is diff generated:
     * 1. Creates a temporary file as a clone of the original file.
     * 2. Applies the proposed changes to the temporary file within the selected range.
     * 3. Opens a diff view comparing original file to the temporary file.
     *
     * This approach ensures that the diff view only shows the changes proposed by Amazon Q,
     * isolating them from any other modifications in the original file.
     *
     * @param message the message from Amazon Q chat
     */
    public async viewDiff(message: any, scheme: string = amazonQDiffScheme) {
        const errorNotification = 'Unable to Open Diff.'
        const { filePath, selection } = extractFileAndCodeSelectionFromMessage(message)

        try {
            if (filePath && message?.code?.trim().length > 0 && selection) {
                const originalFileUri = vscode.Uri.file(filePath)
                const uri = await createTempFileForDiff(originalFileUri, message, selection, scheme)

                // Register content provider and show diff
                const contentProvider = new ContentProvider(uri)
                const disposable = vscode.workspace.registerTextDocumentContentProvider(scheme, contentProvider)
                await vscode.commands.executeCommand(
                    'vscode.diff',
                    originalFileUri,
                    uri,
                    `${path.basename(filePath)} ${amazonQTabSuffix}`
                )

                disposeOnEditorClose(uri, disposable)
            }
        } catch (error) {
            void vscode.window.showInformationMessage(errorNotification)
            const wrappedError = ChatDiffError.chain(error, `Failed to Open Diff View`, { code: chatDiffCode })
            getLogger().error('%s: Failed to open diff view %s', chatDiffCode, getErrorMsg(wrappedError, true))
            throw wrappedError
        }
    }
}
