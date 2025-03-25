/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { CreateCommand, FsWrite } from '../../../codewhispererChat/tools/fsWrite'
import { TestFolder } from '../../testUtil'
import path from 'path'
import assert from 'assert'
import { fs } from '../../../shared/fs/fs'
import { InvokeOutput, OutputKind } from '../../../codewhispererChat/tools/toolShared'

describe('FsWrite Tool', function () {
    let testFolder: TestFolder
    const expectedOutput: InvokeOutput = {
        output: {
            kind: OutputKind.Text,
            content: '',
        },
    }

    before(async function () {
        testFolder = await TestFolder.create()
    })

    describe('create', function () {
        it('creates a new file with fileText content', async function () {
            const filePath = path.join(testFolder.path, 'file1.txt')
            const fileExists = await fs.existsFile(filePath)
            assert.ok(!fileExists)

            const command: CreateCommand = {
                command: 'create',
                fileText: 'Hello World',
                path: filePath,
            }
            const output = await FsWrite.invoke(command)

            const content = await fs.readFileText(filePath)
            assert.strictEqual(content, 'Hello World')

            assert.deepStrictEqual(output, expectedOutput)
        })

        it('replaces existing file with fileText content', async function () {
            const filePath = path.join(testFolder.path, 'file1.txt')
            const fileExists = await fs.existsFile(filePath)
            assert.ok(fileExists)

            const command: CreateCommand = {
                command: 'create',
                fileText: 'Goodbye',
                path: filePath,
            }
            const output = await FsWrite.invoke(command)

            const content = await fs.readFileText(filePath)
            assert.strictEqual(content, 'Goodbye')

            assert.deepStrictEqual(output, expectedOutput)
        })

        it('uses newStr when fileText is not provided', async function () {
            const filePath = path.join(testFolder.path, 'file2.txt')

            const command: CreateCommand = {
                command: 'create',
                newStr: 'Hello World',
                path: filePath,
            }
            const output = await FsWrite.invoke(command)

            const content = await fs.readFileText(filePath)
            assert.strictEqual(content, 'Hello World')

            assert.deepStrictEqual(output, expectedOutput)
        })

        it('creates an empty file when no content is provided', async function () {
            const filePath = path.join(testFolder.path, 'file3.txt')

            const command: CreateCommand = {
                command: 'create',
                path: filePath,
            }
            const output = await FsWrite.invoke(command)

            const content = await fs.readFileText(filePath)
            assert.strictEqual(content, '')

            assert.deepStrictEqual(output, expectedOutput)
        })
    })
})
