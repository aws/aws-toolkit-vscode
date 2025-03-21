/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { FsRead } from '../../../codewhispererChat/tools/fsRead'
import { TestFolder } from '../../testUtil'
import path from 'path'

describe('FsRead Tool', () => {
    let testFolder: TestFolder

    before(async () => {
        testFolder = await TestFolder.create()
    })

    it('reads entire file', async () => {
        const fileContent = 'Line 1\nLine 2\nLine 3'
        const filePath = await testFolder.write('fullFile.txt', fileContent)

        const fsRead = new FsRead({ path: filePath })
        const result = await fsRead.invoke()

        assert.strictEqual(result.output.kind, 'text', 'Output kind should be "text"')
        assert.strictEqual(result.output.content, fileContent, 'File content should match exactly')
    })

    it('reads partial lines of a file', async () => {
        const fileContent = 'A\nB\nC\nD\nE\nF'
        const filePath = await testFolder.write('partialFile.txt', fileContent)

        const fsRead = new FsRead({ path: filePath, readRange: [2, 4] })
        const result = await fsRead.invoke()

        assert.strictEqual(result.output.kind, 'text')
        assert.strictEqual(result.output.content, 'B\nC\nD')
    })

    it('lists directory contents up to depth = 1', async () => {
        await testFolder.mkdir('subfolder')
        await testFolder.write('fileA.txt', 'fileA content')
        await testFolder.write(path.join('subfolder', 'fileB.md'), '# fileB')

        const fsRead = new FsRead({ path: testFolder.path, readRange: [1] })
        const result = await fsRead.invoke()

        const lines = result.output.content.split('\n')
        const hasFileA = lines.some((line) => line.includes('- ') && line.includes('fileA.txt'))
        const hasSubfolder = lines.some((line) => line.includes('d ') && line.includes('subfolder'))

        assert.ok(hasFileA, 'Should list fileA.txt in the directory output')
        assert.ok(hasSubfolder, 'Should list the subfolder in the directory output')
    })

    it('throws error if path does not exist', async () => {
        const missingPath = path.join(testFolder.path, 'no_such_file.txt')
        const fsRead = new FsRead({ path: missingPath })

        await assert.rejects(
            fsRead.invoke(),
            /does not exist or cannot be accessed/i,
            'Expected an error indicating the path does not exist'
        )
    })

    it('throws error if content exceeds 30KB', async function () {
        const bigContent = 'x'.repeat(35_000)
        const bigFilePath = await testFolder.write('bigFile.txt', bigContent)

        const fsRead = new FsRead({ path: bigFilePath })

        await assert.rejects(
            fsRead.invoke(),
            /This tool only supports reading \d+ bytes at a time/i,
            'Expected a size-limit error'
        )
    })

    it('invalid line range', async () => {
        const filePath = await testFolder.write('rangeTest.txt', '1\n2\n3')
        const fsRead = new FsRead({ path: filePath, readRange: [3, 2] })

        const result = await fsRead.invoke()
        assert.strictEqual(result.output.kind, 'text')
        assert.strictEqual(result.output.content, '')
    })
})
