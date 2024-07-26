/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SamAppLocation } from './samProject'

export async function detectSamProjects(
    workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined = vscode.workspace.workspaceFolders
): Promise<SamAppLocation[]> {
    if (!workspaceFolders) {
        return []
    }

    const results = new Map<string, SamAppLocation>()
    const projects = (await Promise.all(workspaceFolders.map(detectSamProjectsFromWorkspaceFolder))).reduce(
        (a, b) => a.concat(b),
        []
    )

    projects.forEach(p => results.set(p.samTemplateUri.toString(), p))

    return Array.from(results.values())
}

async function detectSamProjectsFromWorkspaceFolder(
    workspaceFolder: vscode.WorkspaceFolder
): Promise<SamAppLocation[]> {
    const result: SamAppLocation[] = []

    if (!(await getFiles(workspaceFolder, 'samconfig.toml'))) {
        return result
    }

    const samTemplateFiles = await getFiles(workspaceFolder, 'template.{yml,yaml}', '**/.aws-sam/**')
    for (const samTemplateFile of samTemplateFiles) {
        const project = { samTemplateUri: samTemplateFile, workspaceFolder: workspaceFolder }
        result.push(project)
    }
    return result
}

export async function getFiles(
    workspaceFolder: vscode.WorkspaceFolder,
    pattern: string,
    buildArtifactFolderPattern?: string
): Promise<vscode.Uri[]> {
    try {
        const globPattern = new vscode.RelativePattern(workspaceFolder, pattern)
        const excludePattern = buildArtifactFolderPattern
            ? new vscode.RelativePattern(workspaceFolder, buildArtifactFolderPattern)
            : undefined

        return await vscode.workspace.findFiles(globPattern, excludePattern)
    } catch (error) {
        console.error(`Failed to get files with pattern ${pattern}:`, error)
        return []
    }
}
