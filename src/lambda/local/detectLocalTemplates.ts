/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import * as filesystem from '../../shared/filesystem'

export interface DetectLocalTemplatesContext {
    accessAsync: typeof filesystem.accessAsync
    readdirAsync: typeof filesystem.readdirAsync
    statAsync: typeof filesystem.statAsync
}

class DefaultDetectLocalTemplatesContext implements DetectLocalTemplatesContext {
    public readonly accessAsync = filesystem.accessAsync
    public readonly readdirAsync = filesystem.readdirAsync
    public readonly statAsync = filesystem.statAsync
}

export async function* detectLocalTemplates({
    workspaceFolders,
    context = new DefaultDetectLocalTemplatesContext()
}: {
    workspaceFolders: vscode.Uri[]
    context?: DetectLocalTemplatesContext
}): AsyncIterableIterator<vscode.Uri> {
    for (const workspaceFolder of workspaceFolders) {
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

    const entries = await context.readdirAsync(uri.fsPath)
    for (const entry of entries.map(p => path.join(uri.fsPath, p))) {
        const stats = await context.statAsync(entry)
        if (stats.isDirectory()) {
            yield entry
        }
    }
}

async function* detectTemplatesInFolder(
    context: DetectLocalTemplatesContext,
    folder: string
): AsyncIterableIterator<vscode.Uri> {
    for (const templatePath of [
        path.join(folder, 'template.yaml'),
        path.join(folder, 'template.yml'),
    ]) {
        try {
            await context.accessAsync(templatePath)
            yield vscode.Uri.file(templatePath)
        } catch (err) {
            // This is usually because the file doesn't exist, but could also be a permissions issue.
            // TODO: Log at most verbose (i.e. 'silly') logging level.
        }
    }
}
