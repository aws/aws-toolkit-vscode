/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import WeaverbirdClient, { FileMetadata } from '../client/weaverbirdclient'
import { SystemUtilities } from '../../shared/systemUtilities'
import { getGlobDirExcludedPatterns } from '../../shared/fs/watchedFiles'
import { getWorkspaceRelativePath } from '../../shared/utilities/workspaceUtils'
export function getExcludePattern() {
    const globAlwaysExcludedDirs = getGlobDirExcludedPatterns().map(pattern => `**/${pattern}/`)
    const extraPatterns = ['**/*.zip', '**/*.bin', '**/package-lock.json', '**/*.png', '**/*.jpg', '**/*.svg']
    return `{${[...globAlwaysExcludedDirs, ...extraPatterns].join(',')}}`
}

export async function collectFiles(rootPath: string): Promise<FileMetadata[]> {
    const files = await vscode.workspace.findFiles(new vscode.RelativePattern(rootPath, '**'), getExcludePattern())

    const storage = []
    for (const file of files) {
        const fileContent = await SystemUtilities.readFile(file)
        const relativePath = getWorkspaceRelativePath(file.fsPath)

        if (relativePath) {
            storage.push({
                // The LLM doesn't need absolute paths, only relative from the project
                filePath: relativePath,
                fileContent: fileContent,
            })
        }
    }
    return storage
}

export function getFilePaths(fileContents: WeaverbirdClient.FileMetadataList): string[] {
    return fileContents.map(metadata => metadata.filePath)
}
