/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { featureDevScheme } from '../../amazonqFeatureDev/constants'
import { fs } from '../../shared'

export async function openDiff(leftPath: string, rightPath: string, tabId: string) {
    const { left, right } = await getFileDiffUris(leftPath, rightPath, tabId)
    await vscode.commands.executeCommand('vscode.diff', left, right)
}

export async function openDeletedDiff(filePath: string, name: string, tabId: string) {
    const fileUri = await getOriginalFileUri(filePath, tabId)
    await vscode.commands.executeCommand('vscode.open', fileUri, {}, `${name} (Deleted)`)
}

export async function getOriginalFileUri(fullPath: string, tabId: string) {
    return (await fs.exists(fullPath)) ? vscode.Uri.file(fullPath) : createAmazonQUri('empty', tabId)
}

export async function getFileDiffUris(leftPath: string, rightPath: string, tabId: string) {
    const left = await getOriginalFileUri(leftPath, tabId)
    const right = createAmazonQUri(rightPath, tabId)

    return { left, right }
}

export function createAmazonQUri(path: string, tabId: string) {
    // TODO change the featureDevScheme to a more general amazon q scheme
    return vscode.Uri.from({ scheme: featureDevScheme, path, query: `tabID=${tabId}` })
}
