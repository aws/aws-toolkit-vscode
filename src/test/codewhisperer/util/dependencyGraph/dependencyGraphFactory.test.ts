/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import vscode from 'vscode'
import { join } from 'path'
import { getTestWorkspaceFolder } from '../../../../testInteg/integrationTestsUtilities'
import { DependencyGraphFactory } from '../../../../codewhisperer/util/dependencyGraph/dependencyGraphFactory'
import { terraformDependencyGraph } from '../../../../codewhisperer/util/dependencyGraph/terraformDependencyGraph'

describe('DependencyGraphFactory', function () {
    const workspaceFolder = getTestWorkspaceFolder()
    const openTestFile = async (filePath: string) => {
        const doc = await vscode.workspace.openTextDocument(filePath)
        return await vscode.window.showTextDocument(doc, {
            selection: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
        })
    }

    it('codescan request for file in supported language find generate dependency graph using file extension', async function () {
        const appRoot = join(workspaceFolder, 'terraform-plain-sam-app')
        const appCodePath = join(appRoot, 'src', 'app.tf')
        const editor = await openTestFile(appCodePath)
        const dependencyGraph = DependencyGraphFactory.getDependencyGraph(editor)
        const isTerraformDependencyGraph = dependencyGraph instanceof terraformDependencyGraph
        assert.ok(isTerraformDependencyGraph)
    })
})
