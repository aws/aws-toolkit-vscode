/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { access, stat } from '../../shared/filesystem'
import { readDirAsString } from '../../shared/filesystemUtilities'

export interface DetectLocalTemplatesContext {
    access: typeof access
    readDir: typeof readDirAsString
    stat: typeof stat
}

class DefaultDetectLocalTemplatesContext implements DetectLocalTemplatesContext {
    public readonly access = access
    public readonly readDir = readDirAsString
    public readonly stat = stat
}

export async function* detectLocalTemplates({
    workspaceUris,
    context = new DefaultDetectLocalTemplatesContext()
}: {
    workspaceUris: vscode.Uri[]
    context?: DetectLocalTemplatesContext
}): AsyncIterableIterator<vscode.Uri> {
    for (const workspaceFolder of workspaceUris) {
        for await (const folder of getFolderCandidates(context, workspaceFolder)) {
            yield* detectTemplatesInFolder(context, folder)
        }
    }
}

async function* getFolderCandidates(
    context: DetectLocalTemplatesContext,
    uri: vscode.Uri
): AsyncIterableIterator<string> {
    // Search the root and first level of children only.
    yield uri.fsPath

    const entries = await context.readDir(uri.fsPath)
    for (const entry of entries.map(p => path.join(uri.fsPath, p))) {
        const stats = await context.stat(entry)
        if (stats.isDirectory()) {
            yield entry
        }
    }
}

async function* detectTemplatesInFolder(
    context: DetectLocalTemplatesContext,
    folder: string
): AsyncIterableIterator<vscode.Uri> {
    for (const templatePath of [path.join(folder, 'template.yaml'), path.join(folder, 'template.yml')]) {
        try {
            await context.access(templatePath)
            yield vscode.Uri.file(templatePath)
        } catch (err) {
            // This is usually because the file doesn't exist, but could also be a permissions issue.
            // TODO: Log at most verbose (i.e. 'silly') logging level.
        }
    }
}
