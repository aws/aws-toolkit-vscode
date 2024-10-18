/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import sinon from 'sinon'
import os from 'os'
import { DiffModel, AddedChangeNode, ModifiedChangeNode } from 'aws-core-vscode/codewhisperer/node'
import path from 'path'
import { getTestResourceFilePath } from './amazonQGumbyUtil'
import { fs } from 'aws-core-vscode/shared'

type PatchDescription = {
    name: string
    fileName: string
    isSuccessful: boolean
}

describe('DiffModel', function () {
    afterEach(() => {
        sinon.restore()
    })

    const testDescription =
        '{"name": "Added file", "fileName": "resources/files/addedFile.diffs", "isSuccessful": true}'
    const parsedTestDescription: PatchDescription = JSON.parse(testDescription)

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
            parsedTestDescription
        )

        assert.strictEqual(testDiffModel.patchFileNodes[0].children.length, 1)
        const change = testDiffModel.patchFileNodes[0].children[0]

        assert.strictEqual(change instanceof AddedChangeNode, true)
    })

    it('WHEN parsing a diff patch where a file was modified THEN returns an array representing the modified file', async function () {
        const testDiffModel = new DiffModel()

        const workspacePath = os.tmpdir()

        sinon.replace(fs, 'exists', async (path) => true)

        await fs.writeFile(
            path.join(workspacePath, 'README.md'),
            'This guide walks you through using Gradle to build a simple Java project.'
        )

        testDiffModel.parseDiff(
            getTestResourceFilePath('resources/files/modifiedFile.diff'),
            workspacePath,
            parsedTestDescription
        )

        assert.strictEqual(testDiffModel.patchFileNodes[0].children.length, 1)
        const change = testDiffModel.patchFileNodes[0].children[0]

        assert.strictEqual(change instanceof ModifiedChangeNode, true)

        await fs.delete(path.join(workspacePath, 'README.md'), { recursive: true })
    })
})
