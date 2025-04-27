/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import * as vscode from 'vscode'
import { GrepSearch, GrepSearchParams } from '../../../codewhispererChat/tools/grepSearch'
import { ChildProcess } from '../../../shared/utilities/processUtils'
import { Writable } from 'stream'
import { OutputKind } from '../../../codewhispererChat/tools/toolShared'
import fs from '../../../shared/fs/fs'

describe('GrepSearch', function () {
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
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('constructor', function () {
        it('should initialize with default values', function () {
            const params: GrepSearchParams = {
                query: 'test-query',
            }
            const grepSearch = new GrepSearch(params)

            assert.strictEqual((grepSearch as any).query, 'test-query')
            assert.strictEqual((grepSearch as any).caseSensitive, false)
            assert.strictEqual((grepSearch as any).excludePattern, undefined)
            assert.strictEqual((grepSearch as any).includePattern, undefined)
            assert.strictEqual((grepSearch as any).path, mockWorkspacePath)
        })

        it('should initialize with provided values', function () {
            const params: GrepSearchParams = {
                query: 'test-query',
                caseSensitive: true,
                excludePattern: '*.log',
                includePattern: '*.ts',
                path: '/custom/path',
            }

            const grepSearch = new GrepSearch(params)

            assert.strictEqual((grepSearch as any).query, 'test-query')
            assert.strictEqual((grepSearch as any).caseSensitive, true)
            assert.strictEqual((grepSearch as any).excludePattern, '*.log')
            assert.strictEqual((grepSearch as any).includePattern, '*.ts')
            assert.strictEqual((grepSearch as any).path, '/custom/path')
        })
    })

    describe('getSearchDirectory', function () {
        it('should use provided path when available', function () {
            const grepSearch = new GrepSearch({
                query: 'test-query',
                path: '/custom/path',
            })

            const result = (grepSearch as any).getSearchDirectory('/custom/path')
            assert.strictEqual(result, '/custom/path')
        })

        it('should use workspace folder when path is not provided', function () {
            const grepSearch = new GrepSearch({
                query: 'test-query',
            })

            const result = (grepSearch as any).getSearchDirectory()
            assert.strictEqual(result, mockWorkspacePath)
        })
    })

    describe('validate', function () {
        it('should throw an error if query is empty', async function () {
            const grepSearch = new GrepSearch({ query: '' })
            await assert.rejects(async () => await grepSearch.validate(), /Grep search query cannot be empty/)
        })

        it('should throw an error if query is only whitespace', async function () {
            const grepSearch = new GrepSearch({ query: '   ' })

            await assert.rejects(async () => await grepSearch.validate(), /Grep search query cannot be empty/)
        })

        it('should throw an error if path does not exist', async function () {
            sandbox.restore()
            sandbox = sinon.createSandbox()
            sandbox.stub(fs, 'existsDir').resolves(false)

            const grepSearch = new GrepSearch({
                query: 'test-query',
                path: '/non/existent/path',
            })

            await assert.rejects(
                async () => await grepSearch.validate(),
                /Path: "\/non\/existent\/path" does not exist or cannot be accessed/
            )
        })

        it('should pass validation with valid query and path', async function () {
            const grepSearch = new GrepSearch({
                query: 'test-query',
                path: '/valid/path',
            })
            await assert.doesNotReject(async () => await grepSearch.validate())
        })
    })

    describe('queueDescription', function () {
        it('should write description to updates stream', function () {
            const grepSearch = new GrepSearch({
                query: 'test-query',
                path: '/test/path',
            })

            grepSearch.queueDescription(mockUpdates)

            // eslint-disable-next-line @typescript-eslint/unbound-method
            sinon.assert.calledWith(
                // eslint-disable-next-line @typescript-eslint/unbound-method
                mockUpdates.write as sinon.SinonSpy,
                `Grepping for "test-query" in directory: /test/path`
            )
            // eslint-disable-next-line @typescript-eslint/unbound-method
            sinon.assert.calledOnce(mockUpdates.end as sinon.SinonSpy)
        })
    })

    describe('invoke', function () {
        let grepSearch: GrepSearch

        beforeEach(async function () {
            grepSearch = new GrepSearch({
                query: 'test-query',
                path: '/test/path',
            })
            await grepSearch.validate()
            // Setup ChildProcess run method
            const mockRun = sandbox.stub()
            mockRun.resolves({ stdout: 'search-results', stderr: '', exitCode: 0 })
            sandbox.stub(ChildProcess.prototype, 'run').callsFake(mockRun)

            // Mock processRipgrepOutput
            sandbox.stub(grepSearch as any, 'processRipgrepOutput').returns({
                sanitizedOutput: 'processed-results',
                totalMatchCount: 5,
            })
        })

        it('should execute ripgrep and return results', async function () {
            const result = await grepSearch.invoke()
            assert.deepStrictEqual(result, {
                output: {
                    kind: OutputKind.Text,
                    content: 'processed-results',
                },
            })
        })

        it('should write updates to the provided stream', async function () {
            await grepSearch.invoke(mockUpdates)

            // eslint-disable-next-line @typescript-eslint/unbound-method
            sinon.assert.calledWith(mockUpdates.write as sinon.SinonSpy, 'processed-results')
        })

        it('should throw an error if ripgrep execution fails', async function () {
            sandbox.restore()
            sandbox = sinon.createSandbox()
            // Make ChildProcess.run throw an error
            sandbox.stub(ChildProcess.prototype, 'run').rejects(new Error('Command failed'))
            grepSearch = new GrepSearch({
                query: 'test-query',
                path: '/test/path',
            })
            await assert.rejects(async () => await grepSearch.invoke(), /Failed to search/)
        })
    })

    describe('createOutput', function () {
        it('should create output with content', function () {
            const grepSearch = new GrepSearch({
                query: 'test-query',
            })

            const output = (grepSearch as any).createOutput('test content')

            assert.deepStrictEqual(output, {
                output: {
                    kind: OutputKind.Text,
                    content: 'test content',
                },
            })
        })

        it('should create output with default message when content is empty', function () {
            const grepSearch = new GrepSearch({
                query: 'test-query',
            })

            const output = (grepSearch as any).createOutput('')

            assert.deepStrictEqual(output, {
                output: {
                    kind: OutputKind.Text,
                    content: 'No matches found.',
                },
            })
        })
    })
})
