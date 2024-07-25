/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from 'fs'
import * as vscode from 'vscode'
import { featureDevScheme } from '../../amazonqFeatureDev/constants'

export async function openDiff(leftPath: string, rightPath: string, tabId: string) {
    const { left, right } = getFileDiffUris(leftPath, rightPath, tabId)
    await vscode.commands.executeCommand('vscode.diff', left, right)
}

export async function openDeletedDiff(filePath: string, name: string, tabId: string) {
    const fileUri = getOriginalFileUri(filePath, tabId)
    await vscode.commands.executeCommand('vscode.open', fileUri, {}, `${name} (Deleted)`)
}

export function getOriginalFileUri(fullPath: string, tabId: string) {
    return existsSync(fullPath) ? vscode.Uri.file(fullPath) : createAmazonQUri('empty', tabId)
}

export function getFileDiffUris(leftPath: string, rightPath: string, tabId: string) {
    const left = getOriginalFileUri(leftPath, tabId)
    const right = createAmazonQUri(rightPath, tabId)

    return { left, right }
}

export function createAmazonQUri(path: string, tabId: string) {
    // TODO change the featureDevScheme to a more general amazon q scheme
    return vscode.Uri.from({ scheme: featureDevScheme, path, query: `tabID=${tabId}` })
}
