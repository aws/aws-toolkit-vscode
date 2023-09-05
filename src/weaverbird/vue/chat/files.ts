/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { FileMetadata } from '../../client/weaverbirdclient'
import { SystemUtilities } from '../../../shared/systemUtilities'

export async function collectFiles(rootPath: string): Promise<FileMetadata[]> {
    const files = await vscode.workspace.findFiles(new vscode.RelativePattern(rootPath, '**'))

    const storage = []
    for (const file of files) {
        const fileContent = await SystemUtilities.readFile(file)
        storage.push({
            // The LLM doesn't need absolute paths, only relative from the project
            filePath: file.fsPath.replace(rootPath, 'src'),
            fileContent: fileContent,
        })
    }
    return storage
}
