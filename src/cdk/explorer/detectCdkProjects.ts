/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

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
    const pattern = new vscode.RelativePattern(workspaceFolder, '**/cdk.json')
    const cdkJsonFiles = await vscode.workspace.findFiles(pattern)

    for await (const cdkJson of cdkJsonFiles) {
        try {
            const cdkJsonDoc = await vscode.workspace.openTextDocument(cdkJson)
            const { output = 'cdk.out' } = JSON.parse(cdkJsonDoc.getText())
            const treeJsonPath = path.resolve(path.dirname(cdkJson.fsPath), path.join(output, 'tree.json'))
            const project = { workspaceFolder: workspaceFolder, cdkJsonPath: cdkJson.fsPath, treePath: treeJsonPath }
            result.push(project)
        } catch (err) {
            getLogger().error(`Failed to parse cdk.json from %s: %O`, cdkJson.fsPath, err)
        }
    }

    return result
}
