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
        const listDirectory = new ListDirectory({ path: '' })
        await assert.rejects(listDirectory.validate(), /Path cannot be empty/i, 'Expected an error about empty path')
    })

    it('lists directory contents', async () => {
        await testFolder.mkdir('subfolder')
        await testFolder.write('fileA.txt', 'fileA content')
        await testFolder.write(path.join('subfolder', 'fileB.md'), '# fileB')

        const listDirectory = new ListDirectory({ path: testFolder.path })
        await listDirectory.validate()
        const result = await listDirectory.invoke(process.stdout)

        const lines = result.output.content.split('\n')
        const hasFileA = lines.some((line: string | string[]) => line.includes('- ') && line.includes('fileA.txt'))
        const hasSubfolder = lines.some((line: string | string[]) => line.includes('d ') && line.includes('subfolder'))

        assert.ok(hasFileA, 'Should list fileA.txt in the directory output')
        assert.ok(hasSubfolder, 'Should list the subfolder in the directory output')
    })

    it('throws error if path does not exist', async () => {
        const missingPath = path.join(testFolder.path, 'no_such_file.txt')
        const listDirectory = new ListDirectory({ path: missingPath })

        await assert.rejects(
            listDirectory.validate(),
            /does not exist or cannot be accessed/i,
            'Expected an error indicating the path does not exist'
        )
    })

    it('expands ~ path', async () => {
        const listDirectory = new ListDirectory({ path: '~' })
        await listDirectory.validate()
        const result = await listDirectory.invoke(process.stdout)

        assert.strictEqual(result.output.kind, 'text')
        assert.ok(result.output.content.length > 0)
    })

    it('resolves relative path', async () => {
        await testFolder.mkdir('relTest')
        const filePath = path.join('relTest', 'relFile.txt')
        const content = 'Hello from a relative file!'
        await testFolder.write(filePath, content)

        const relativePath = path.relative(process.cwd(), path.join(testFolder.path, filePath))

        const listDirectory = new ListDirectory({ path: relativePath })
        await listDirectory.validate()
        const result = await listDirectory.invoke(process.stdout)

        assert.strictEqual(result.output.kind, 'text')
        assert.strictEqual(result.output.content, content)
    })
})
