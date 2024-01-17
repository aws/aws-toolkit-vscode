/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import {
    DiffModel,
    AddedChangeNode,
    RemovedChangeNode,
    ModifiedChangeNode,
} from '../../../codewhisperer/service/transformationResultsViewProvider'
import path from 'path'
import { createTestFile } from '../../testUtil'

const getTestFilePath = (relativePathToFile: string) => {
    return path.resolve(__dirname, relativePathToFile)
}

describe('DiffModel', function () {
    it('WHEN parsing a diff patch where a file was added THEN returns an array representing the added file', async function () {
        const testDiffModel = new DiffModel()

        const workspacePath = 'workspace'
        const tmpPath = (await createTestFile('testfile.txt')).path.replace('/testfile.txt', '')

        await testDiffModel.parseDiff(getTestFilePath('resources/addedFile.diff'), tmpPath, workspacePath)

        assert.strictEqual(testDiffModel.changes.length, 1)
        const change = testDiffModel.changes[0]

        assert.strictEqual(change instanceof AddedChangeNode, true)
    })

    it('WHEN parsing a diff patch where a file was removed THEN returns an array representing the removed file', async function () {
        const testDiffModel = new DiffModel()

        const workspacePath = (await createTestFile('settings.gradle')).path.replace('/settings.gradle', '')
        const tmpPath = 'tmp'

        await testDiffModel.parseDiff(getTestFilePath('resources/removedFile.diff'), tmpPath, workspacePath)

        assert.strictEqual(testDiffModel.changes.length, 1)
        const change = testDiffModel.changes[0]

        assert.strictEqual(change instanceof RemovedChangeNode, true)
    })

    it('WHEN parsing a diff patch where a file was modified THEN returns an array representing the modified file', async function () {
        const testDiffModel = new DiffModel()

        const path = (await createTestFile('README.md')).path.replace('/README.md', '')

        await testDiffModel.parseDiff(getTestFilePath('resources/modifiedFile.diff'), path, path)

        assert.strictEqual(testDiffModel.changes.length, 1)
        const change = testDiffModel.changes[0]

        assert.strictEqual(change instanceof ModifiedChangeNode, true)
    })
})
