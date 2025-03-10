/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { fs } from '../../shared/fs/fs'
import { diffLines } from 'diff'

export async function openDiff(leftPath: string, rightPath: string, tabId: string, scheme: string) {
    const { left, right } = await getFileDiffUris(leftPath, rightPath, tabId, scheme)
    await vscode.commands.executeCommand('vscode.diff', left, right)
}

export async function openDeletedDiff(filePath: string, name: string, tabId: string, scheme: string) {
    const left = await getOriginalFileUri(filePath, tabId, scheme)
    const right = createAmazonQUri('empty', tabId, scheme)
    await vscode.commands.executeCommand('vscode.diff', left, right, `${name} (Deleted)`)
}

export async function getOriginalFileUri(fullPath: string, tabId: string, scheme: string) {
    return (await fs.exists(fullPath)) ? vscode.Uri.file(fullPath) : createAmazonQUri('empty', tabId, scheme)
}

export async function getFileDiffUris(leftPath: string, rightPath: string, tabId: string, scheme: string) {
    const left = await getOriginalFileUri(leftPath, tabId, scheme)
    const right = createAmazonQUri(rightPath, tabId, scheme)

    return { left, right }
}

export function createAmazonQUri(path: string, tabId: string, scheme: string) {
    return vscode.Uri.from({ scheme: scheme, path, query: `tabID=${tabId}` })
}

export async function computeDiff(
    leftPath: string,
    rightPath: string,
    tabId: string,
    scheme: string,
    reportedChanges?: string
) {
    const { left, right } = await getFileDiffUris(leftPath, rightPath, tabId, scheme)
    const leftFile = await vscode.workspace.openTextDocument(left)
    const rightFile = await vscode.workspace.openTextDocument(right)

    const changes = diffLines(reportedChanges ?? leftFile.getText(), rightFile.getText(), {
        ignoreWhitespace: true,
    })

    let charsAdded = 0
    let charsRemoved = 0
    let linesAdded = 0
    let linesRemoved = 0
    for (const change of changes) {
        const lines = change.value.split('\n')
        const charCount = lines.reduce((sum, line) => sum + line.length, 0)
        const lineCount = change.count ?? lines.length - 1 // ignoring end-of-file empty line
        if (change.added) {
            charsAdded += charCount
            linesAdded += lineCount
        } else if (change.removed) {
            charsRemoved += charCount
            linesRemoved += lineCount
        }
    }
    return { changes, charsAdded, linesAdded, charsRemoved, linesRemoved }
}
