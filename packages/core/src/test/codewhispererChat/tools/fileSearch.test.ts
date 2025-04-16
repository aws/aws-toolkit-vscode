/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import * as vscode from 'vscode'
import { FileSearch, FileSearchParams } from '../../../codewhispererChat/tools/fileSearch'
import { Writable } from 'stream'
import { OutputKind } from '../../../codewhispererChat/tools/toolShared'
import fs from '../../../shared/fs/fs'
import * as workspaceUtils from '../../../shared/utilities/workspaceUtils'
import * as filesystemUtilities from '../../../shared/filesystemUtilities'

describe('FileSearch', function () {
    let sandbox: sinon.SinonSandbox
    let mockUpdates: Writable
    const mockWorkspacePath = '/mock/workspace'

    beforeEach(function () {
        sandbox = sinon.createSandbox()

        // Create a mock Writable stream for updates
        mockUpdates = new Writable({
            write: (chunk, encoding, callback) => {
                callback()
            },
        })
        sandbox.spy(mockUpdates, 'write')
        sandbox.spy(mockUpdates, 'end')

        // Mock workspace folders
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([
            {
                uri: { fsPath: mockWorkspacePath } as vscode.Uri,
                name: 'mockWorkspace',
                index: 0,
            },
        ])

        // Mock fs.existsDir to always return true
        sandbox.stub(fs, 'existsDir').resolves(true)

        // Mock readDirectoryRecursively
        sandbox
            .stub(workspaceUtils, 'readDirectoryRecursively')
            .resolves([
                'F /mock/workspace/file1.ts',
                'F /mock/workspace/file2.js',
                'F /mock/workspace/subfolder/file3.ts',
                'F /mock/workspace/subfolder/file4.json',
                'D /mock/workspace/subfolder',
            ])

        // Mock isInDirectory
        sandbox.stub(filesystemUtilities, 'isInDirectory').returns(true)
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('constructor', function () {
        it('should initialize with provided values', function () {
            const params: FileSearchParams = {
                path: '/test/path',
                pattern: '.*\\.ts$',
                maxDepth: 2,
                caseSensitive: true,
            }

            const fileSearch = new FileSearch(params)

            assert.strictEqual((fileSearch as any).fsPath, '/test/path')
            assert.strictEqual((fileSearch as any).pattern.source, '.*\\.ts$')
            assert.strictEqual((fileSearch as any).maxDepth, 2)
            // Check that the RegExp was created with case sensitivity
            assert.strictEqual((fileSearch as any).pattern.flags, '')
        })

        it('should initialize with case insensitive pattern by default', function () {
            const params: FileSearchParams = {
                path: '/test/path',
                pattern: '.*\\.ts$',
            }

            const fileSearch = new FileSearch(params)

            assert.strictEqual((fileSearch as any).pattern.flags, 'i')
        })
    })

    describe('validate', function () {
        it('should throw an error if path is empty', async function () {
            const fileSearch = new FileSearch({ path: '', pattern: '.*\\.ts$' })
            await assert.rejects(async () => await fileSearch.validate(), /Path cannot be empty/)
        })

        it('should throw an error if path is only whitespace', async function () {
            const fileSearch = new FileSearch({ path: '   ', pattern: '.*\\.ts$' })
            await assert.rejects(async () => await fileSearch.validate(), /Path cannot be empty/)
        })

        it('should throw an error if maxDepth is negative', async function () {
            const fileSearch = new FileSearch({
                path: '/test/path',
                pattern: '.*\\.ts$',
                maxDepth: -1,
            })
            await assert.rejects(async () => await fileSearch.validate(), /MaxDepth cannot be negative/)
        })

        it('should throw an error if path does not exist', async function () {
            sandbox.restore()
            sandbox = sinon.createSandbox()
            sandbox.stub(fs, 'existsDir').resolves(false)

            const fileSearch = new FileSearch({
                path: '/non/existent/path',
                pattern: '.*\\.ts$',
            })

            await assert.rejects(
                async () => await fileSearch.validate(),
                /Path: "\/non\/existent\/path" does not exist or cannot be accessed/
            )
        })

        it('should pass validation with valid path and pattern', async function () {
            const fileSearch = new FileSearch({
                path: '/valid/path',
                pattern: '.*\\.ts$',
            })
            await assert.doesNotReject(async () => await fileSearch.validate())
        })
    })

    describe('queueDescription', function () {
        it('should write description for recursive search', function () {
            const fileSearch = new FileSearch({
                path: '/test/path',
                pattern: '.*\\.ts$',
            })

            fileSearch.queueDescription(mockUpdates)

            // eslint-disable-next-line @typescript-eslint/unbound-method
            sinon.assert.calledWith(
                // eslint-disable-next-line @typescript-eslint/unbound-method
                mockUpdates.write as sinon.SinonSpy,
                `Searching for files matching pattern: /.*\\.ts$/i in path recursively`
            )
            // eslint-disable-next-line @typescript-eslint/unbound-method
            sinon.assert.calledOnce(mockUpdates.end as sinon.SinonSpy)
        })

        it('should write description for current directory only', function () {
            const fileSearch = new FileSearch({
                path: '/test/path',
                pattern: '.*\\.ts$',
                maxDepth: 0,
            })

            fileSearch.queueDescription(mockUpdates)

            // eslint-disable-next-line @typescript-eslint/unbound-method
            sinon.assert.calledWith(
                // eslint-disable-next-line @typescript-eslint/unbound-method
                mockUpdates.write as sinon.SinonSpy,
                `Searching for files matching pattern: /.*\\.ts$/i in path`
            )
        })

        it('should write description for limited depth search', function () {
            const fileSearch = new FileSearch({
                path: '/test/path',
                pattern: '.*\\.ts$',
                maxDepth: 1,
            })

            fileSearch.queueDescription(mockUpdates)

            // eslint-disable-next-line @typescript-eslint/unbound-method
            sinon.assert.calledWith(
                // eslint-disable-next-line @typescript-eslint/unbound-method
                mockUpdates.write as sinon.SinonSpy,
                `Searching for files matching pattern: /.*\\.ts$/i in path limited to 1 subfolder level`
            )
        })

        it('should use plural form for multiple levels', function () {
            const fileSearch = new FileSearch({
                path: '/test/path',
                pattern: '.*\\.ts$',
                maxDepth: 3,
            })

            fileSearch.queueDescription(mockUpdates)

            // eslint-disable-next-line @typescript-eslint/unbound-method
            sinon.assert.calledWith(
                // eslint-disable-next-line @typescript-eslint/unbound-method
                mockUpdates.write as sinon.SinonSpy,
                `Searching for files matching pattern: /.*\\.ts$/i in path limited to 3 subfolder levels`
            )
        })
    })

    describe('requiresAcceptance', function () {
        it('should require acceptance when no workspace folders exist', function () {
            sandbox.restore()
            sandbox = sinon.createSandbox()
            sandbox.stub(vscode.workspace, 'workspaceFolders').value(undefined)

            const fileSearch = new FileSearch({
                path: '/test/path',
                pattern: '.*\\.ts$',
            })

            const result = fileSearch.requiresAcceptance()
            assert.strictEqual(result.requiresAcceptance, true)
        })

        it('should require acceptance when path is outside workspace', function () {
            sandbox.restore()
            sandbox = sinon.createSandbox()
            sandbox.stub(vscode.workspace, 'workspaceFolders').value([
                {
                    uri: { fsPath: '/workspace' } as vscode.Uri,
                    name: 'workspace',
                    index: 0,
                },
            ])
            sandbox.stub(filesystemUtilities, 'isInDirectory').returns(false)

            const fileSearch = new FileSearch({
                path: '/outside/workspace',
                pattern: '.*\\.ts$',
            })

            const result = fileSearch.requiresAcceptance()
            assert.strictEqual(result.requiresAcceptance, true)
        })

        it('should not require acceptance when path is inside workspace', function () {
            const fileSearch = new FileSearch({
                path: '/mock/workspace/subfolder',
                pattern: '.*\\.ts$',
            })

            const result = fileSearch.requiresAcceptance()
            assert.strictEqual(result.requiresAcceptance, false)
        })
    })

    describe('invoke', function () {
        let fileSearch: FileSearch

        beforeEach(async function () {
            fileSearch = new FileSearch({
                path: '/test/path',
                pattern: '.*\\.ts$',
            })
            await fileSearch.validate()
        })

        it('should filter files by regex pattern', async function () {
            const result = await fileSearch.invoke()

            // Should only include .ts files
            assert.deepStrictEqual(result, {
                output: {
                    kind: OutputKind.Text,
                    content: 'F /mock/workspace/file1.ts\nF /mock/workspace/subfolder/file3.ts',
                },
            })
        })

        it('should handle case sensitivity correctly', async function () {
            // Create a case-sensitive search for .TS (uppercase)
            fileSearch = new FileSearch({
                path: '/test/path',
                pattern: '.*\\.TS$',
                caseSensitive: true,
            })
            await fileSearch.validate()

            // Should not match any files since our mock files use lowercase .ts
            const result = await fileSearch.invoke()
            assert.deepStrictEqual(result, {
                output: {
                    kind: OutputKind.Text,
                    content: '',
                },
            })
        })

        it('should throw an error if file search fails', async function () {
            sandbox.restore()
            sandbox = sinon.createSandbox()
            // Make readDirectoryRecursively throw an error
            sandbox.stub(workspaceUtils, 'readDirectoryRecursively').rejects(new Error('Access denied'))
            sandbox.stub(fs, 'existsDir').resolves(true)

            fileSearch = new FileSearch({
                path: '/test/path',
                pattern: '.*\\.ts$',
            })

            await assert.rejects(
                async () => await fileSearch.invoke(),
                /Failed to search files in "\/test\/path": Access denied/
            )
        })
    })

    describe('createOutput', function () {
        it('should create output with content', function () {
            const fileSearch = new FileSearch({
                path: '/test/path',
                pattern: '.*\\.ts$',
            })

            const output = (fileSearch as any).createOutput('test content')

            assert.deepStrictEqual(output, {
                output: {
                    kind: OutputKind.Text,
                    content: 'test content',
                },
            })
        })

        it('should create output with empty content', function () {
            const fileSearch = new FileSearch({
                path: '/test/path',
                pattern: '.*\\.ts$',
            })

            const output = (fileSearch as any).createOutput('')

            assert.deepStrictEqual(output, {
                output: {
                    kind: OutputKind.Text,
                    content: '',
                },
            })
        })
    })
})
