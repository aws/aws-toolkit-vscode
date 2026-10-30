/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import path from 'path'
import { isRealPathInDirectory } from '../../applicationcomposer/workspacePath'
import { TestFolder } from '../testUtil'
import { createSymlinkOrSkip } from './utils'

describe('isRealPathInDirectory', function () {
    let testFolder: TestFolder
    let directory: string

    beforeEach(async function () {
        testFolder = await TestFolder.create()
        directory = await testFolder.mkdir('project')
    })

    it('returns true for a file inside of the directory', async function () {
        const file = await testFolder.write('project/template.yaml', '')
        assert.strictEqual(await isRealPathInDirectory(directory, file), true)
    })

    it('returns true for a file that does not exist yet', async function () {
        assert.strictEqual(await isRealPathInDirectory(directory, path.join(directory, 'new/folder/file.yaml')), true)
    })

    it('returns false for the directory itself', async function () {
        assert.strictEqual(await isRealPathInDirectory(directory, directory), false)
    })

    it('returns false for a path that leaves the directory', async function () {
        await testFolder.write('outside/file.yaml', '')
        assert.strictEqual(await isRealPathInDirectory(directory, path.join(directory, '../outside/file.yaml')), false)
    })

    it('returns false for a sibling folder whose name starts with the directory name', async function () {
        const file = await testFolder.write('project-other/file.yaml', '')
        assert.strictEqual(await isRealPathInDirectory(directory, file), false)
    })

    it('returns false for a link to a file outside of the directory', async function () {
        const target = await testFolder.write('outside/file.yaml', '')
        const link = path.join(directory, 'link.yaml')
        await createSymlinkOrSkip(this, target, link)
        assert.strictEqual(await isRealPathInDirectory(directory, link), false)
    })

    it('returns false for links that form a loop', async function () {
        const linkA = path.join(directory, 'a.yaml')
        const linkB = path.join(directory, 'b.yaml')
        await createSymlinkOrSkip(this, linkB, linkA)
        await createSymlinkOrSkip(this, linkA, linkB)
        assert.strictEqual(await isRealPathInDirectory(directory, linkA), false)
    })
})
