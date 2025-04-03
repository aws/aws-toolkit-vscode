/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { ListDirectory } from '../../../codewhispererChat/tools/listDirectory'
import { TestFolder } from '../../testUtil'
import path from 'path'

describe('ListDirectory Tool', () => {
    let testFolder: TestFolder

    before(async () => {
        testFolder = await TestFolder.create()
    })

    it('throws if path is empty', async () => {
        const listDirectory = new ListDirectory({ path: '', maxDepth: 0 })
        await assert.rejects(listDirectory.validate(), /Path cannot be empty/i, 'Expected an error about empty path')
    })

    it('lists directory contents', async () => {
        await testFolder.mkdir('subfolder')
        await testFolder.write('fileA.txt', 'fileA content')

        const listDirectory = new ListDirectory({ path: testFolder.path, maxDepth: 0 })
        await listDirectory.validate()
        const result = await listDirectory.invoke(process.stdout)

        const lines = result.output.content.split('\n')
        const hasFileA = lines.some((line: string | string[]) => line.includes('[FILE] ') && line.includes('fileA.txt'))
        const hasSubfolder = lines.some(
            (line: string | string[]) => line.includes('[DIR] ') && line.includes('subfolder')
        )

        assert.ok(hasFileA, 'Should list fileA.txt in the directory output')
        assert.ok(hasSubfolder, 'Should list the subfolder in the directory output')
    })

    it('lists directory contents recursively', async () => {
        await testFolder.mkdir('subfolder')
        await testFolder.write('fileA.txt', 'fileA content')
        await testFolder.write(path.join('subfolder', 'fileB.md'), '# fileB')

        const listDirectory = new ListDirectory({ path: testFolder.path, maxDepth: -1 })
        await listDirectory.validate()
        const result = await listDirectory.invoke(process.stdout)

        const lines = result.output.content.split('\n')
        const hasFileA = lines.some((line: string | string[]) => line.includes('[FILE] ') && line.includes('fileA.txt'))
        const hasSubfolder = lines.some(
            (line: string | string[]) => line.includes('[DIR] ') && line.includes('subfolder')
        )
        const hasFileB = lines.some((line: string | string[]) => line.includes('[FILE] ') && line.includes('fileB.md'))

        assert.ok(hasFileA, 'Should list fileA.txt in the directory output')
        assert.ok(hasSubfolder, 'Should list the subfolder in the directory output')
        assert.ok(hasFileB, 'Should list fileB.md in the subfolder in the directory output')
    })

    it('throws error if path does not exist', async () => {
        const missingPath = path.join(testFolder.path, 'no_such_file.txt')
        const listDirectory = new ListDirectory({ path: missingPath, maxDepth: 0 })

        await assert.rejects(
            listDirectory.validate(),
            /does not exist or cannot be accessed/i,
            'Expected an error indicating the path does not exist'
        )
    })

    it('expands ~ path', async () => {
        const listDirectory = new ListDirectory({ path: '~', maxDepth: 0 })
        await listDirectory.validate()
        const result = await listDirectory.invoke(process.stdout)

        assert.strictEqual(result.output.kind, 'text')
        assert.ok(result.output.content.length > 0)
    })
})
