/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import { detectCdkProjects } from '../../cdk/explorer/detectCdkProjects'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { saveCdkJson } from './treeTestUtils'
import { createTestWorkspaceFolder } from '../testUtil'
import { FakeExtensionContext } from '../fakeExtensionContext'

describe('detectCdkProjects', function () {
    const workspacePaths: string[] = []
    const workspaceFolders: vscode.WorkspaceFolder[] = []

    beforeEach(async function () {
        await FakeExtensionContext.getFakeExtContext()
        const workspaceFolder = await createTestWorkspaceFolder('vsctk-cdk')

        workspacePaths.push(workspaceFolder.uri.path)
        workspaceFolders.push(workspaceFolder)
    })

    afterEach(async function () {
        for (const path of workspacePaths) {
            await fs.remove(path)
        }

        workspacePaths.length = 0
        workspaceFolders.length = 0
    })

    it('detects no projects when workspaceFolders is undefined', async function () {
        const actual = await detectCdkProjects(undefined)

        assert.ok(actual)
        assert.strictEqual(actual.length, 0)
    })

    it('detects no projects when workspaceFolders is empty', async function () {
        const actual = await detectCdkProjects([])

        assert.ok(actual)
        assert.strictEqual(actual.length, 0)
    })

    it('detects no projects when cdk.json does not exist', async function () {
        const actual = await detectCdkProjects(workspaceFolders)

        assert.ok(actual)
        assert.strictEqual(actual.length, 0)
    })

    it('detects CDK project when cdk.json exists', async function () {
        const cdkJsonPath = path.join(workspaceFolders[0].uri.fsPath, 'cdk.json')
        await saveCdkJson(cdkJsonPath)
        const actual = await detectCdkProjects(workspaceFolders)

        assert.ok(actual)

        const project = actual[0]
        assert.ok(project)
        assert.strictEqual(project.cdkJsonPath, cdkJsonPath)
        assert.strictEqual(project.workspaceFolder.uri.fsPath, workspaceFolders[0].uri.fsPath)
        assert.strictEqual(project.treePath, path.join(cdkJsonPath, '..', 'cdk.out', 'tree.json'))
    })

    it('detects CDK projects in multi-folder workspace', async function () {
        assert.strictEqual(workspacePaths.length, 1)

        workspacePaths.push(await makeTemporaryToolkitFolder('vsctk2'))
        workspaceFolders.push({
            uri: vscode.Uri.file(workspacePaths[1]),
            name: path.basename(workspacePaths[1]),
            index: 1,
        })

        const projectPath1 = path.join(workspaceFolders[0].uri.fsPath, 'cdk.json')
        const projectPath2 = path.join(workspaceFolders[1].uri.fsPath, 'cdk.json')

        await saveCdkJson(projectPath1)
        await saveCdkJson(projectPath2)
        const actual = await detectCdkProjects(workspaceFolders)
        assert.ok(actual)
        assert.strictEqual(actual.length, 2)

        const project1 = actual[0]
        const project2 = actual[1]

        assert.ok(project1)
        assert.strictEqual(project1.cdkJsonPath, projectPath1)
        assert.strictEqual(project1.workspaceFolder.uri.fsPath, workspaceFolders[0].uri.fsPath)
        assert.strictEqual(project1.treePath, path.join(projectPath1, '..', 'cdk.out', 'tree.json'))
        assert.ok(project2)
        assert.strictEqual(project2.cdkJsonPath, projectPath2)
        assert.strictEqual(project2.workspaceFolder.uri.fsPath, workspaceFolders[1].uri.fsPath)
        assert.strictEqual(project2.treePath, path.join(projectPath2, '..', 'cdk.out', 'tree.json'))
    })
})
