/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as path from 'path'
import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import { Window } from '../../shared/vscode/window'

export const amazonRegistryName = localize('AWS.explorerNode.registry.name.amazon', 'Owned by Amazon')
export const userRegistryName = localize('AWS.explorerNode.registry.name.self', 'Owned by me')
export const sharedRegistryName = localize('AWS.explorerNode.registry.name.shared', 'Shared with me')

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

export async function showConfirmationMessage(
    { prompt, confirm, cancel }: { prompt: string; confirm: string; cancel: string },
    window: Window
): Promise<boolean> {
    const confirmItem: vscode.MessageItem = { title: confirm }
    const cancelItem: vscode.MessageItem = { title: cancel, isCloseAffordance: true }

    const selection = await window.showWarningMessage(prompt, { modal: true }, confirmItem, cancelItem)
    return selection === confirmItem
}
