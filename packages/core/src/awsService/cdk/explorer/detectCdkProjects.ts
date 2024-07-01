/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { getLogger } from '../../shared/logger'
import { CdkAppLocation } from './cdkProject'

export async function detectCdkProjects(
    workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined = vscode.workspace.workspaceFolders
): Promise<CdkAppLocation[]> {
    if (!workspaceFolders) {
        return []
    }

    const results = new Map<string, CdkAppLocation>()
    const projects = (await Promise.all(workspaceFolders.map(detectCdkProjectsFromWorkspaceFolder))).reduce(
        (a, b) => a.concat(b),
        []
    )

    projects.forEach(p => results.set(p.cdkJsonUri.toString(), p))

    return Array.from(results.values())
}

async function detectCdkProjectsFromWorkspaceFolder(
    workspaceFolder: vscode.WorkspaceFolder
): Promise<CdkAppLocation[]> {
    const result = []
    const pattern = new vscode.RelativePattern(workspaceFolder, '**/cdk.json')
    const cdkJsonFiles = await vscode.workspace.findFiles(pattern, '**/node_modules/**')

    for await (const cdkJson of cdkJsonFiles) {
        try {
            const cdkJsonDoc = await vscode.workspace.openTextDocument(cdkJson)
            const { output = 'cdk.out' } = JSON.parse(cdkJsonDoc.getText())
            const outputUri = vscode.Uri.file(path.resolve(vscode.Uri.joinPath(cdkJson, '..').fsPath, output))
            const treeJsonUri = vscode.Uri.joinPath(outputUri, 'tree.json')
            const project = { cdkJsonUri: cdkJson, treeUri: treeJsonUri }
            result.push(project)
        } catch (err) {
            getLogger().error(`Failed to parse cdk.json from %s: %O`, cdkJson.fsPath, err)
        }
    }

    return result
}
