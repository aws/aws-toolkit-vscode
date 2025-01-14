/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import sinon from 'sinon'
import { DiffModel, AddedChangeNode, ModifiedChangeNode } from 'aws-core-vscode/codewhisperer/node'
import { DescriptionContent } from 'aws-core-vscode/codewhisperer'
import path from 'path'
import { getTestResourceFilePath } from './amazonQGumbyUtil'
import { fs } from 'aws-core-vscode/shared'
import { createTestWorkspace } from 'aws-core-vscode/test'

describe('DiffModel', function () {
    let parsedTestDescriptions: DescriptionContent
    beforeEach(async () => {
        parsedTestDescriptions = JSON.parse(await fs.readFileText(getTestResourceFilePath('resources/files/diff.json')))
    })

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
        testDiffModel.parseDiff(
            getTestResourceFilePath('resources/files/addedFile.diff'),
            workspacePath,
            parsedTestDescriptions.content[0],
            1
        )

        assert.strictEqual(
            testDiffModel.patchFileNodes[0].patchFilePath,
            getTestResourceFilePath('resources/files/addedFile.diff')
        )
        assert(testDiffModel.patchFileNodes[0].label.includes(parsedTestDescriptions.content[0].name))
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
            workspaceFolder.uri.fsPath,
            parsedTestDescriptions.content[0],
            1
        )

        assert.strictEqual(
            testDiffModel.patchFileNodes[0].patchFilePath,
            getTestResourceFilePath('resources/files/modifiedFile.diff')
        )
        assert(testDiffModel.patchFileNodes[0].label.includes(parsedTestDescriptions.content[0].name))
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
            workspaceFolder.uri.fsPath,
            undefined,
            1
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
