/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { access, stat } from '../../shared/filesystem'
import { readDirAsString } from '../../shared/filesystemUtilities'

export interface CdkProject {
    workspaceFolder: vscode.WorkspaceFolder
    treePath: string
}

export async function detectCdkProjects(
    workspaceFolders: vscode.WorkspaceFolder[] | undefined = vscode.workspace.workspaceFolders
): Promise<CdkProject[]> {
    if (!workspaceFolders) {
        return []
    }

    return (await Promise.all(workspaceFolders.map(detectCdkProjectsFromWorkspaceFolder))).reduce(
        (accumulator: CdkProject[], current: CdkProject[]) => {
            accumulator.push(...current)

            return accumulator
        },
        []
    )
}

async function detectCdkProjectsFromWorkspaceFolder(workspaceFolder: vscode.WorkspaceFolder): Promise<CdkProject[]> {
    const result = []

    for await (const projectJson of detectLocalCdkProjects({ workspaceUris: [workspaceFolder.uri] })) {
        const project = { workspaceFolder: workspaceFolder, treePath: projectJson.fsPath }
        result.push(project)
    }

    return result
}

export interface DetectCdkProjectsContext {
    access: typeof access
    readDir: typeof readDirAsString
    stat: typeof stat
}

class DefaultDetectCdkProjectsContext implements DetectCdkProjectsContext {
    public readonly access = access
    public readonly readDir = readDirAsString
    public readonly stat = stat
}

export async function* detectLocalCdkProjects({
    workspaceUris,
    context = new DefaultDetectCdkProjectsContext()
}: {
    workspaceUris: vscode.Uri[]
    context?: DetectCdkProjectsContext
}): AsyncIterableIterator<vscode.Uri> {
    for (const workspaceFolder of workspaceUris) {
        for await (const folder of getFolderCandidates(context, workspaceFolder)) {
            yield* detectCdkProjectsInFolder(context, folder)
        }
    }
}

async function* getFolderCandidates(context: DetectCdkProjectsContext, uri: vscode.Uri): AsyncIterableIterator<string> {
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

async function* detectCdkProjectsInFolder(
    context: DetectCdkProjectsContext,
    folder: string
): AsyncIterableIterator<vscode.Uri> {
    for (const cdkJsonPath of [path.join(folder, 'cdk.out', 'tree.json')]) {
        try {
            await context.access(cdkJsonPath)
            yield vscode.Uri.file(cdkJsonPath)
        } catch (err) {
            // This is usually because the file doesn't exist, but could also be a permissions issue.
            // TODO: Log at most verbose (i.e. 'silly') logging level.
        }
    }
}
