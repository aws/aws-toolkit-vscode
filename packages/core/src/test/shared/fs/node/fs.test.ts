/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import nodeFs from 'fs/promises'
import { TestFolder } from '../../../testUtil'
import assert from 'assert'
import { fs } from '../../../../shared'

describe('Node FS', () => {
    let testFolder: TestFolder

    beforeEach(async function () {
        testFolder = await TestFolder.create()
    })

    describe('open()', () => {
        it('"w" flag clears file content', async () => {
            const filePath = testFolder.pathFrom('file.txt')

            // Make initial file with text
            await nodeFs.writeFile(filePath, 'test')
            assert.strictEqual(await fs.readFileText(filePath), 'test')

            // Open file with "w"
            const fileHandle = await nodeFs.open(filePath, 'w')
            await fileHandle.close()

            // file content was cleared
            assert.strictEqual(await fs.readFileText(filePath), '')
        })
    })

    describe('sync()', () => {
        // we cannot accurately test if sync() works, so just assert nothing breaks when using it
        it('runs without error', async () => {
            const filePath = testFolder.pathFrom('file.txt')

            // Make initial file with text
            await nodeFs.writeFile(filePath, 'test')
            assert.strictEqual(await fs.readFileText(filePath), 'test')

            const fileHandle = await nodeFs.open(filePath, 'w')
            await fileHandle.writeFile('updatedText')
            await fileHandle.sync() // method under test
            await fileHandle.close()

            // file content was cleared
            assert.strictEqual(await fs.readFileText(filePath), 'updatedText')
        })
    })
})
