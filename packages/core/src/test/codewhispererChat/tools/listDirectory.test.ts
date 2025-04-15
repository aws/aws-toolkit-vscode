/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { ListDirectory } from '../../../codewhispererChat/tools/listDirectory'
import { TestFolder } from '../../testUtil'
import path from 'path'
import * as vscode from 'vscode'
import sinon from 'sinon'

describe('ListDirectory Tool', () => {
    let testFolder: TestFolder

    before(async () => {
        testFolder = await TestFolder.create()
    })

    afterEach(() => {
        sinon.restore()
    })

    it('throws if path is empty', async () => {
        const listDirectory = new ListDirectory({ path: '', maxDepth: 0 })
        await assert.rejects(listDirectory.validate(), /Path cannot be empty/i, 'Expected an error about empty path')
    })

    it('throws if maxDepth is negative', async () => {
        const listDirectory = new ListDirectory({ path: '~', maxDepth: -1 })
        await assert.rejects(
            listDirectory.validate(),
            /MaxDepth cannot be negative/i,
            'Expected an error about negative maxDepth'
        )
    })

    it('lists directory contents', async () => {
        await testFolder.mkdir('subfolder')
        await testFolder.write('fileA.txt', 'fileA content')

        const listDirectory = new ListDirectory({ path: testFolder.path, maxDepth: 0 })
        await listDirectory.validate()
        const result = await listDirectory.invoke(process.stdout)

        const lines = result.output.content.split('\n')
        const hasFileA = lines.some((line: string | string[]) => line.includes('[F] ') && line.includes('fileA.txt'))
        const hasSubfolder = lines.some(
            (line: string | string[]) => line.includes('[D] ') && line.includes('subfolder')
        )

        assert.ok(hasFileA, 'Should list fileA.txt in the directory output')
        assert.ok(hasSubfolder, 'Should list the subfolder in the directory output')
    })

    it('lists directory contents recursively', async () => {
        await testFolder.mkdir('subfolder')
        await testFolder.write('fileA.txt', 'fileA content')
        await testFolder.write(path.join('subfolder', 'fileB.md'), '# fileB')

        const listDirectory = new ListDirectory({ path: testFolder.path })
        await listDirectory.validate()
        const result = await listDirectory.invoke(process.stdout)

        const lines = result.output.content.split('\n')
        const hasFileA = lines.some((line: string | string[]) => line.includes('[F] ') && line.includes('fileA.txt'))
        const hasSubfolder = lines.some(
            (line: string | string[]) => line.includes('[D] ') && line.includes('subfolder')
        )
        const hasFileB = lines.some((line: string | string[]) => line.includes('[F] ') && line.includes('fileB.md'))

        assert.ok(hasFileA, 'Should list fileA.txt in the directory output')
        assert.ok(hasSubfolder, 'Should list the subfolder in the directory output')
        assert.ok(hasFileB, 'Should list fileB.md in the subfolder in the directory output')
    })

    it('lists directory contents with ignored pattern', async () => {
        await testFolder.mkdir('node_modules')
        await testFolder.write(path.join('node_modules', 'fileC.md'), '# fileC')

        const listDirectory = new ListDirectory({ path: testFolder.path })
        await listDirectory.validate()
        const result = await listDirectory.invoke(process.stdout)

        const lines = result.output.content.split('\n')
        const hasNodeModules = lines.some(
            (line: string | string[]) => line.includes('[D] ') && line.includes('node_modules')
        )
        const hasFileC = lines.some((line: string | string[]) => line.includes('[F] ') && line.includes('fileC.md'))

        assert.ok(!hasNodeModules, 'Should not list node_modules in the directory output')
        assert.ok(!hasFileC, 'Should not list fileC.md under node_modules in the directory output')
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

    it('should require acceptance if fsPath is outside the workspace', () => {
        const workspaceStub = sinon
            .stub(vscode.workspace, 'workspaceFolders')
            .value([{ uri: { fsPath: '/workspace/folder' } } as any])
        const listDir = new ListDirectory({ path: '/not/in/workspace/dir', maxDepth: 0 })
        const result = listDir.requiresAcceptance()
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
        const listDir = new ListDirectory({ path: '/workspace/folder/mydir', maxDepth: 0 })
        const result = listDir.requiresAcceptance()
        assert.equal(
            result.requiresAcceptance,
            false,
            'Expected requiresAcceptance to be false for a path inside the workspace'
        )
        workspaceStub.restore()
    })
})
