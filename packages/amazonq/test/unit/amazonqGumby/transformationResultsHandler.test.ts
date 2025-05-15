/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import sinon from 'sinon'
import { DiffModel, AddedChangeNode, ModifiedChangeNode } from 'aws-core-vscode/codewhisperer/node'
import path from 'path'
import { getTestResourceFilePath } from './amazonQGumbyUtil'
import { fs } from 'aws-core-vscode/shared'
import { createTestWorkspace } from 'aws-core-vscode/test'

describe('DiffModel', function () {
    afterEach(() => {
        sinon.restore()
    })

    it('WHEN parsing a diff patch where a file was added THEN returns an array representing the added file', async function () {
        const testDiffModel = new DiffModel()

        const workspacePath = 'workspace'

        sinon.replace(fs, 'exists', async (path) => {
            const pathStr = path.toString()
            if (pathStr.includes(workspacePath)) {
                return false
            }

            return true
        })
        testDiffModel.parseDiff(getTestResourceFilePath('resources/files/addedFile.diff'), workspacePath)

        assert.strictEqual(
            testDiffModel.patchFileNodes[0].patchFilePath,
            getTestResourceFilePath('resources/files/addedFile.diff')
        )
        const change = testDiffModel.patchFileNodes[0].children[0]

        assert.strictEqual(change instanceof AddedChangeNode, true)
    })

    it('WHEN parsing a diff patch where a file was modified THEN returns an array representing the modified file', async function () {
        const testDiffModel = new DiffModel()

        const fileAmount = 1
        const workspaceFolder = await createTestWorkspace(fileAmount, { fileContent: '' })

        await fs.writeFile(
            path.join(workspaceFolder.uri.fsPath, 'README.md'),
            'This guide walks you through using Gradle to build a simple Java project.'
        )

        testDiffModel.parseDiff(
            getTestResourceFilePath('resources/files/modifiedFile.diff'),
            workspaceFolder.uri.fsPath
        )

        assert.strictEqual(
            testDiffModel.patchFileNodes[0].patchFilePath,
            getTestResourceFilePath('resources/files/modifiedFile.diff')
        )
        const change = testDiffModel.patchFileNodes[0].children[0]

        assert.strictEqual(change instanceof ModifiedChangeNode, true)
    })

    it('WHEN parsing a diff patch where diff.json is not present and a file was modified THEN returns an array representing the modified file', async function () {
        const testDiffModel = new DiffModel()

        const fileAmount = 1
        const workspaceFolder = await createTestWorkspace(fileAmount, { fileContent: '' })

        await fs.writeFile(
            path.join(workspaceFolder.uri.fsPath, 'README.md'),
            'This guide walks you through using Gradle to build a simple Java project.'
        )

        testDiffModel.parseDiff(
            getTestResourceFilePath('resources/files/modifiedFile.diff'),
            workspaceFolder.uri.fsPath
        )

        assert.strictEqual(
            testDiffModel.patchFileNodes[0].patchFilePath,
            getTestResourceFilePath('resources/files/modifiedFile.diff')
        )
        assert(testDiffModel.patchFileNodes[0].label.endsWith('modifiedFile.diff'))
        const change = testDiffModel.patchFileNodes[0].children[0]

        assert.strictEqual(change instanceof ModifiedChangeNode, true)
    })
})
