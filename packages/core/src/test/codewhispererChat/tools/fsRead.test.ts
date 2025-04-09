/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { FsRead } from '../../../codewhispererChat/tools/fsRead'
import { TestFolder } from '../../testUtil'
import path from 'path'
import sinon from 'sinon'
import * as vscode from 'vscode'

describe('FsRead Tool', () => {
    let testFolder: TestFolder

    before(async () => {
        testFolder = await TestFolder.create()
    })

    afterEach(() => {
        sinon.restore()
    })

    it('throws if path is empty', async () => {
        const fsRead = new FsRead({ path: '' })
        await assert.rejects(fsRead.validate(), /Path cannot be empty/i, 'Expected an error about empty path')
    })

    it('reads entire file', async () => {
        const fileContent = 'Line 1\nLine 2\nLine 3'
        const filePath = await testFolder.write('fullFile.txt', fileContent)

        const fsRead = new FsRead({ path: filePath })
        await fsRead.validate()
        const result = await fsRead.invoke(process.stdout)

        assert.strictEqual(result.output.kind, 'text', 'Output kind should be "text"')
        assert.strictEqual(result.output.content, fileContent, 'File content should match exactly')
    })

    it('reads partial lines of a file', async () => {
        const fileContent = 'A\nB\nC\nD\nE\nF'
        const filePath = await testFolder.write('partialFile.txt', fileContent)

        const fsRead = new FsRead({ path: filePath, readRange: [2, 4] })
        await fsRead.validate()
        const result = await fsRead.invoke(process.stdout)

        assert.strictEqual(result.output.kind, 'text')
        assert.strictEqual(result.output.content, 'B\nC\nD')
    })

    it('throws error if path does not exist', async () => {
        const missingPath = path.join(testFolder.path, 'no_such_file.txt')
        const fsRead = new FsRead({ path: missingPath })

        await assert.rejects(
            fsRead.validate(),
            /does not exist or cannot be accessed/i,
            'Expected an error indicating the path does not exist'
        )
    })

    it('throws error if content exceeds 30KB', async function () {
        const bigContent = 'x'.repeat(35_000)
        const bigFilePath = await testFolder.write('bigFile.txt', bigContent)

        const fsRead = new FsRead({ path: bigFilePath })
        await fsRead.validate()

        await assert.rejects(
            fsRead.invoke(process.stdout),
            /This tool only supports reading \d+ bytes at a time/i,
            'Expected a size-limit error'
        )
    })

    it('invalid line range', async () => {
        const filePath = await testFolder.write('rangeTest.txt', '1\n2\n3')
        const fsRead = new FsRead({ path: filePath, readRange: [3, 2] })

        await fsRead.validate()
        const result = await fsRead.invoke(process.stdout)
        assert.strictEqual(result.output.kind, 'text')
        assert.strictEqual(result.output.content, '')
    })

    it('should require acceptance if fsPath is outside the workspace', () => {
        const workspaceStub = sinon
            .stub(vscode.workspace, 'workspaceFolders')
            .value([{ uri: { fsPath: '/workspace/folder' } } as any])
        const fsRead = new FsRead({ path: '/not/in/workspace/file.txt' })
        const result = fsRead.requiresAcceptance()
        assert.equal(
            result.requiresAcceptance,
            true,
            'Expected requiresAcceptance to be true for a path outside the workspace'
        )
        workspaceStub.restore()
    })

    it('should not require acceptance if fsPath is inside the workspace', () => {
        const workspaceStub = sinon
            .stub(vscode.workspace, 'workspaceFolders')
            .value([{ uri: { fsPath: '/workspace/folder' } } as any])
        const fsRead = new FsRead({ path: '/workspace/folder/file.txt' })
        const result = fsRead.requiresAcceptance()
        assert.equal(
            result.requiresAcceptance,
            false,
            'Expected requiresAcceptance to be false for a path inside the workspace'
        )
        workspaceStub.restore()
    })
})
