/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import * as fs from 'fs-extra'

export async function openAndSaveDocument(
    content: string,
    filename: string,
    language: string
): Promise<vscode.TextDocument> {
    const wsPath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '/'
    let filePath = path.join(wsPath, filename)
    const fileInfo = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(filePath) })

    if (fileInfo) {
        filePath = fileInfo.fsPath
        fs.writeFileSync(filePath, content)
        const openPath = vscode.Uri.file(filePath)

        return await vscode.workspace.openTextDocument(openPath)
    }

    // The user didn't save the file, so just open an untitiled file
    return await vscode.workspace.openTextDocument({ content: content, language: language })
}
