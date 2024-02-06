/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import { detectCdkProjects } from '../../cdk/explorer/detectCdkProjects'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { saveCdkJson } from './treeTestUtils'
import { createTestWorkspaceFolder } from '../testUtil'
import { FakeExtensionContext } from '../fakeExtensionContext'
import { mkdirp, writeJSON } from 'fs-extra'
import { waitUntil } from '../../shared/utilities/timeoutUtils'

describe('detectCdkProjects', function () {
    const workspacePaths: string[] = []
    const workspaceFolders: vscode.WorkspaceFolder[] = []

    // eslint-disable-next-line @typescript-eslint/naming-convention
    async function detectCdkProjects_wait(dirs: any) {
        return (
            (await waitUntil(
                async () => {
                    return await detectCdkProjects(dirs)
                },
                {
                    timeout: 10000,
                    interval: 250,
                    truthy: true,
                }
            )) ?? []
        )
    }

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
        const cdkJsonUri = vscode.Uri.joinPath(workspaceFolders[0].uri, 'cdk.json')
        await saveCdkJson(cdkJsonUri.fsPath)
        const actual = await detectCdkProjects_wait(workspaceFolders)

        assert.ok(actual)

        const project = actual[0]
        assert.ok(project)
        assert.strictEqual(project.cdkJsonUri.fsPath, cdkJsonUri.fsPath)
        assert.strictEqual(project.treeUri.fsPath, vscode.Uri.joinPath(cdkJsonUri, '..', 'cdk.out', 'tree.json').fsPath)
    })

    it('detects deep projects', async function () {
        const cdkJsonUri = vscode.Uri.joinPath(workspaceFolders[0].uri, 'directory1', 'directory2', 'cdk.json')
        await mkdirp(path.dirname(cdkJsonUri.fsPath))
        await saveCdkJson(cdkJsonUri.fsPath)
        const actual = await detectCdkProjects_wait(workspaceFolders)
        assert.strictEqual(actual[0]?.cdkJsonUri.fsPath, cdkJsonUri.fsPath)
    })

    it('ignores projects in `node_modules`', async function () {
        const cdkJsonPath = path.join(workspaceFolders[0].uri.fsPath, 'node_modules', 'lib', 'cdk.json')
        await mkdirp(path.dirname(cdkJsonPath))
        await saveCdkJson(cdkJsonPath)
        const actual = await detectCdkProjects_wait(workspaceFolders)
        assert.strictEqual(actual.length, 0)
    })

    it('de-dupes identical projects`', async function () {
        workspaceFolders.push(workspaceFolders[0])

        try {
            const cdkJsonUri = vscode.Uri.joinPath(workspaceFolders[0].uri, 'cdk.json')
            await saveCdkJson(cdkJsonUri.fsPath)

            const actual = await detectCdkProjects_wait(workspaceFolders)
            assert.strictEqual(actual.length, 1)
        } finally {
            workspaceFolders.pop()
        }
    })

    it('takes into account `output` from cdk.json to build tree.json path', async function () {
        const cdkJsonUri = vscode.Uri.joinPath(workspaceFolders[0].uri, 'cdk.json')
        await writeJSON(cdkJsonUri.fsPath, { app: 'npx ts-node bin/demo-nov7.ts', output: 'build/cdk.out' })
        const actual = await detectCdkProjects_wait(workspaceFolders)

        assert.ok(actual)

        const project = actual[0]
        assert.ok(project)
        assert.strictEqual(project.cdkJsonUri.fsPath, cdkJsonUri.fsPath)
        assert.strictEqual(
            project.treeUri.fsPath,
            vscode.Uri.joinPath(cdkJsonUri, '..', 'build/cdk.out', 'tree.json').fsPath
        )
    })

    it('detects CDK projects in multi-folder workspace', async function () {
        assert.strictEqual(workspacePaths.length, 1)

        workspacePaths.push(await makeTemporaryToolkitFolder('vsctk2'))
        workspaceFolders.push({
            uri: vscode.Uri.file(workspacePaths[1]),
            name: path.basename(workspacePaths[1]),
            index: 1,
        })

        const projectPath1 = vscode.Uri.joinPath(workspaceFolders[0].uri, 'cdk.json')
        const projectPath2 = vscode.Uri.joinPath(workspaceFolders[1].uri, 'cdk.json')

        await saveCdkJson(projectPath1.fsPath)
        await saveCdkJson(projectPath2.fsPath)
        const actual = await detectCdkProjects_wait(workspaceFolders)
        assert.ok(actual)
        assert.strictEqual(actual.length, 2)

        const project1 = actual[0]
        const project2 = actual[1]

        assert.ok(project1)
        assert.strictEqual(project1.cdkJsonUri.fsPath, projectPath1.fsPath)
        assert.strictEqual(
            project1.treeUri.fsPath,
            vscode.Uri.joinPath(projectPath1, '..', 'cdk.out', 'tree.json').fsPath
        )
        assert.ok(project2)
        assert.strictEqual(project2.cdkJsonUri.fsPath, projectPath2.fsPath)
        assert.strictEqual(
            project2.treeUri.fsPath,
            vscode.Uri.joinPath(projectPath2, '..', 'cdk.out', 'tree.json').fsPath
        )
    })
})
