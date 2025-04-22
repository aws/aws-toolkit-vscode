/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _path from 'path'
import * as vscode from 'vscode'
import { disposeOnEditorClose, getTabSizeSetting } from './editorUtilities'
import { tempDirPath } from '../filesystemUtilities'
import { getLogger } from '../logger/logger'
import fs from '../fs/fs'
import { ToolkitError } from '../errors'
import { indent } from './textUtilities'

/**
 * Finds occurences of text in a document. Currently only used for highlighting cloudwatchlogs data.
 * @param document Document to search.
 * @param keyword Keyword to search for.
 * @returns the ranges of each and every occurence of the keyword.
 */
export function findOccurencesOf(document: vscode.TextDocument, keyword: string): vscode.Range[] {
    const ranges: vscode.Range[] = []
    let lineNum = 0

    keyword = keyword.toLowerCase()

    while (lineNum < document.lineCount) {
        const currentLine = document.lineAt(lineNum)
        const currentLineText = currentLine.text.toLowerCase()
        let indexOccurrence = currentLineText.indexOf(keyword, 0)

        while (indexOccurrence >= 0) {
            ranges.push(
                new vscode.Range(
                    new vscode.Position(lineNum, indexOccurrence),
                    new vscode.Position(lineNum, indexOccurrence + keyword.length)
                )
            )
            indexOccurrence = currentLineText.indexOf(keyword, indexOccurrence + 1)
        }
        lineNum += 1
    }
    return ranges
}
/**
 * If the specified document is currently open, and marked as dirty, it is saved.
 */
export async function saveDocumentIfDirty(documentPath: string): Promise<void> {
    const path = _path.normalize(vscode.Uri.file(documentPath).fsPath)
    const document = vscode.workspace.textDocuments.find((doc) => {
        if (!doc.isDirty) {
            return false
        }

        if (_path.normalize(doc.uri.fsPath) !== path) {
            return false
        }

        return true
    })

    if (document) {
        await document.save()
    }
}

/**
 * Determine the tab width used by the editor.
 *
 * @param editor The editor for which to determine the tab width.
 */
export function getTabSize(editor?: vscode.TextEditor): number {
    const tabSize = !editor ? undefined : editor.options.tabSize

    switch (typeof tabSize) {
        case 'number':
            return tabSize
        case 'string':
            return Number.parseInt(tabSize, 10)
        default:
            return getTabSizeSetting()
    }
}

/**
 * Creates a selection range from the given document and selection.
 * If a user selects a partial code, this function generates the range from start line to end line.
 *
 * @param {vscode.TextDocument} doc - The VSCode document where the selection is applied.
 * @param {vscode.Selection} selection - The selection range in the document.
 * @returns {vscode.Range} - The VSCode range object representing the start and end of the selection.
 */
export function getSelectionFromRange(doc: vscode.TextDocument, selection: vscode.Selection) {
    return new vscode.Range(
        new vscode.Position(selection.start.line, 0),
        new vscode.Position(selection.end.line, doc.lineAt(selection.end.line).range.end.character)
    )
}

/**
 * Applies the given code to the specified range in the document.
 * Saves the document after the edit is successfully applied.
 *
 * @param {vscode.TextDocument} doc - The VSCode document to which the changes are applied.
 * @param {vscode.Range} range - The range in the document where the code is replaced.
 * @param {string} code - The code to be applied to the document.
 * @returns {Promise<void>} - Resolves when the changes are successfully applied and the document is saved.
 */
export async function applyChanges(doc: vscode.TextDocument, range: vscode.Range, code: string) {
    const edit = new vscode.WorkspaceEdit()
    edit.replace(doc.uri, range, code)
    const successfulEdit = await vscode.workspace.applyEdit(edit)
    if (successfulEdit) {
        getLogger().debug('Diff: Edits successfully applied to: %s', doc.uri.fsPath)
        await doc.save()
    } else {
        getLogger().error('Diff: Unable to apply changes to: %s', doc.uri.fsPath)
    }
}

/**
 * Creates a temporary file for diff comparison by cloning the original file
 * and applying the proposed changes within the selected range.
 *
 * @param {vscode.Uri} originalFileUri - The URI of the original file.
 * @param {any} message - The message object containing the proposed code changes.
 * @param {vscode.Selection} selection - The selection range in the document where the changes are applied.
 * @returns {Promise<vscode.Uri>} - A promise that resolves to the URI of the temporary file.
 */
export async function createTempFileForDiff(
    originalFileUri: vscode.Uri,
    message: any,
    selection: vscode.Selection,
    scheme: string
): Promise<vscode.Uri> {
    const errorCode = 'createTempFile'
    const id = Date.now()
    const languageId = (await vscode.workspace.openTextDocument(originalFileUri)).languageId
    const tempFile = _path.parse(originalFileUri.path)
    const tempFilePath = _path.join(tempDirPath, `${tempFile.name}_proposed-${id}${tempFile.ext}`)
    await fs.mkdir(tempDirPath)
    const tempFileUri = vscode.Uri.parse(`${scheme}:${tempFilePath}`)
    getLogger().debug('Diff: Creating temp file: %s', tempFileUri.fsPath)

    try {
        // Write original content to temp file
        await fs.writeFile(tempFilePath, await fs.readFileText(originalFileUri.fsPath))
    } catch (error) {
        if (!(error instanceof Error)) {
            throw error
        }
        throw ToolkitError.chain(error, 'Failed to write to temp file', { code: errorCode })
    }

    // Apply the proposed changes to the temp file
    const doc = await vscode.workspace.openTextDocument(tempFileUri.path)
    const languageIdStatus = await vscode.languages.setTextDocumentLanguage(doc, languageId)
    if (languageIdStatus) {
        getLogger().debug('Diff: languageId for %s is set to: %s', tempFileUri.fsPath, languageId)
    } else {
        getLogger().error('Diff: Unable to set languageId for %s to: %s', tempFileUri.fsPath, languageId)
    }

    const code = getIndentedCode(message, doc, selection)
    const range = getSelectionFromRange(doc, selection)

    await applyChanges(doc, range, code)
    return tempFileUri
}

/**
 * Indents the given code based on the current document's indentation at the selection start.
 *
 * @param message The message object containing the code.
 * @param doc The VSCode document where the code is applied.
 * @param selection The selection range in the document.
 * @returns The processed code to be applied to the document.
 */
export function getIndentedCode(message: any, doc: vscode.TextDocument, selection: vscode.Selection) {
    const indentRange = new vscode.Range(new vscode.Position(selection.start.line, 0), selection.active)
    let indentation = doc.getText(indentRange)

    if (indentation.trim().length !== 0) {
        indentation = ' '.repeat(indentation.length - indentation.trimStart().length)
    }

    return indent(message.code, indentation.length)
}

export async function showFile(uri: vscode.Uri) {
    const doc = await vscode.workspace.openTextDocument(uri)
    await vscode.window.showTextDocument(doc, { preview: false })
    await vscode.languages.setTextDocumentLanguage(doc, 'log')
}

/**
 * Expands the given selection to full line(s) in the document.
 * If the selection is partial, it will be extended to include the entire line(s).
 * @param document The current text document
 * @param selection The current selection
 * @returns A new Range that covers full line(s) of the selection
 */
export function expandSelectionToFullLines(document: vscode.TextDocument, selection: vscode.Selection): vscode.Range {
    const startLine = document.lineAt(selection.start.line)
    const endLine = document.lineAt(selection.end.line)
    return new vscode.Range(startLine.range.start, endLine.range.end)
}

/**
 * Ensures the document ends with a newline character.
 * If the selection is at the end of the last line and the document doesn't end with a newline,
 * this function inserts one.
 * @param editor The VS Code text editor to modify
 */
export async function addEofNewline(editor: vscode.TextEditor) {
    if (
        editor.selection.end.line === editor.document.lineCount - 1 &&
        editor.selection.end.character === editor.document.lineAt(editor.selection.end.line).text.length &&
        !editor.document.getText().endsWith('\n')
    ) {
        await editor.edit((editBuilder) => {
            editBuilder.insert(editor.selection.end, '\n')
        })
    }
}

class ReadonlyTextDocumentProvider implements vscode.TextDocumentContentProvider {
    private content = ''

    setContent(content: string) {
        this.content = content
    }

    provideTextDocumentContent(uri: vscode.Uri): string {
        return this.content
    }
}

/**
 * Shows a read only virtual txt file on a side column
 * It's read-only so that the "save" option doesn't appear when user closes the pop up window
 * Usage: ReadonlyDocument.show(content, filename)
 * @param content The content to be displayed in the virtual document
 * @param filename The title on top of the pop up window
 */
class ReadonlyDocument {
    private readonly scheme = 'AWStoolkit-readonly'
    private readonly provider = new ReadonlyTextDocumentProvider()

    public async show(content: string, filename: string) {
        const disposableProvider = vscode.workspace.registerTextDocumentContentProvider(this.scheme, this.provider)
        this.provider.setContent(content)
        const uri = vscode.Uri.parse(`${this.scheme}:/${filename}.txt`)
        // txt document on side column, in focus and preview
        const options: vscode.TextDocumentShowOptions = {
            viewColumn: vscode.ViewColumn.Beside,
            preserveFocus: false,
            preview: true,
        }

        // Open the document with the updated content
        const document = await vscode.workspace.openTextDocument(uri)
        await vscode.window.showTextDocument(document, options)

        disposeOnEditorClose(uri, disposableProvider)
    }
}

export const readonlyDocument = new ReadonlyDocument()
