/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _path from 'path'
import * as vscode from 'vscode'
import { getTabSizeSetting } from './editorUtilities'
import * as fs from 'fs-extra'

/**
 * If the specified document is currently open, and marked as dirty, it is saved.
 */
export async function saveDocumentIfDirty(documentPath: string): Promise<void> {
    const path = _path.normalize(vscode.Uri.file(documentPath).fsPath)
    const document = vscode.workspace.textDocuments.find(doc => {
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
 * Helper function to create a text file with supplied content and open it with a TextEditor
 *
 * @param fileText The supplied text to fill this file with
 * @param filePath The full path to the file to be created
 *
 * @returns TextEditor that was just opened
 */

export async function openATextEditorWithText(fileText: string, filePath: string): Promise<vscode.TextEditor> {
    await fs.writeFile(filePath, fileText)

    const textDocument = await vscode.workspace.openTextDocument(filePath)

    return await vscode.window.showTextDocument(textDocument)
}
