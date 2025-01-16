/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import vscode from 'vscode'

/**
 * Finds the file specified by `filenameGlob` in the VSCode workspace, opens
 * it in an editor tab, returns it as a `TextDocument`.
 *
 * @returns `TextDocument`, or undefined if the file could not be found.
 */
export async function openDocument(filePath: string): Promise<vscode.TextDocument | undefined> {
    const found = await vscode.workspace.findFiles(filePath)
    if (found.length === 0) {
        return undefined
    }

    await vscode.commands.executeCommand('vscode.open', found[0])
    const document = vscode.workspace.textDocuments.find((o) => o.uri.fsPath.includes(found[0].fsPath))
    if (!document) {
        return undefined
    }

    return document
}
