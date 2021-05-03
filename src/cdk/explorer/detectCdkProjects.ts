/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { access, readdir, stat } from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import { CdkAppLocation } from './cdkProject'

export async function detectCdkProjects(
    workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined = vscode.workspace.workspaceFolders
): Promise<CdkAppLocation[]> {
    if (!workspaceFolders) {
        return []
    }

    return (await Promise.all(workspaceFolders.map(detectCdkProjectsFromWorkspaceFolder))).reduce(
        (accumulator: CdkAppLocation[], current: CdkAppLocation[]) => {
            accumulator.push(...current)

            return accumulator
        },
        []
    )
}

async function detectCdkProjectsFromWorkspaceFolder(
    workspaceFolder: vscode.WorkspaceFolder
): Promise<CdkAppLocation[]> {
    const result = []

    for await (const cdkJson of detectLocalCdkProjects({ workspaceUris: [workspaceFolder.uri] })) {
        const treeJsonPath = path.join(path.dirname(cdkJson.fsPath), 'cdk.out', 'tree.json')
        const project = { workspaceFolder: workspaceFolder, cdkJsonPath: cdkJson.fsPath, treePath: treeJsonPath }
        result.push(project)
    }

    return result
}

export async function* detectLocalCdkProjects({
    workspaceUris,
}: {
    workspaceUris: vscode.Uri[]
}): AsyncIterableIterator<vscode.Uri> {
    for (const workspaceFolder of workspaceUris) {
        for await (const folder of getFolderCandidates(workspaceFolder, 2, 0)) {
            yield* detectCdkProjectsInFolder(folder)
        }
    }
}

/**
 * Generates names of directory `uri` and its descendant directories up to `maxLevels` levels.
 */
async function* getFolderCandidates(uri: vscode.Uri, maxLevels: number, level: number): AsyncIterableIterator<string> {
    if (!(await stat(uri.fsPath)).isDirectory()) {
        throw Error(`not a directory: "${uri.fsPath}"`)
    }
    yield uri.fsPath

    const entries = await readdir(uri.fsPath)
    for (const entry of entries.map(p => path.join(uri.fsPath, p))) {
        const stats = await stat(entry)
        if (stats.isDirectory()) {
            if (level <= maxLevels) {
                const dirUri = vscode.Uri.file(entry)
                yield* getFolderCandidates(dirUri, maxLevels, level + 1)
            }
        }
    }
}

async function* detectCdkProjectsInFolder(folder: string): AsyncIterableIterator<vscode.Uri> {
    const cdkJsonPath = path.join(folder, 'cdk.json')
    try {
        await access(cdkJsonPath)
        yield vscode.Uri.file(cdkJsonPath)
    } catch (err) {
        if (err.code !== 'ENOENT') {
            // Permissions issue?
            getLogger().debug(`Error detecting CDK apps in ${folder}: %O`, err as Error)
        }
    }
}
