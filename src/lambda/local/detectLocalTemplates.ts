/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { access, readdir, stat } from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'

const DEFAULT_FOLDER_DEPTH = 4

export async function* detectLocalTemplates({
    workspaceUris,
    folderDepth = getFolderDepth()
}: {
    workspaceUris: vscode.Uri[]
    folderDepth?: number
}): AsyncIterableIterator<vscode.Uri> {
    for (const workspaceFolder of workspaceUris) {
        for await (const folder of getFolderCandidates(workspaceFolder, folderDepth)) {
            yield* detectTemplatesInFolder(folder)
        }
    }
}

async function* getFolderCandidates(uri: vscode.Uri, folderDepth: number): AsyncIterableIterator<string> {
    // Search the root and first level of children only.
    yield uri.fsPath

    const entries = await readdir(uri.fsPath)
    for (const entry of entries.filter(p => !p.startsWith('.')).map(p => path.join(uri.fsPath, p))) {
        const stats = await stat(entry)
        if (stats.isDirectory()) {
            if (folderDepth > 0) {
                const nextUri = vscode.Uri.file(path.join(entry))
                yield* getFolderCandidates(nextUri, folderDepth - 1)
            }
        }
    }
}

async function* detectTemplatesInFolder(folder: string): AsyncIterableIterator<vscode.Uri> {
    for (const templatePath of [path.join(folder, 'template.yaml'), path.join(folder, 'template.yml')]) {
        try {
            await access(templatePath)
            yield vscode.Uri.file(templatePath)
        } catch (err) {
            // This is usually because the file doesn't exist, but could also be a permissions issue.
            // TODO: Log at most verbose (i.e. 'silly') logging level.
        }
    }
}

function getFolderDepth(): number {
    return vscode.workspace.getConfiguration('aws').get<number>('sam.template.depth', DEFAULT_FOLDER_DEPTH)
}
