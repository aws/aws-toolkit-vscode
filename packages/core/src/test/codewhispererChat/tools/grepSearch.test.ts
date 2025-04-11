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

describe('GrepSearch', () => {
    let sandbox: sinon.SinonSandbox
    let mockUpdates: Writable
    const mockWorkspacePath = '/mock/workspace'

    beforeEach(() => {
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

    afterEach(() => {
        sandbox.restore()
    })

    describe('constructor', () => {
        it('should initialize with default values', () => {
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

        it('should initialize with provided values', () => {
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

    describe('getSearchDirectory', () => {
        it('should use provided path when available', () => {
            const grepSearch = new GrepSearch({
                query: 'test-query',
                path: '/custom/path',
            })

            const result = (grepSearch as any).getSearchDirectory('/custom/path')
            assert.strictEqual(result, '/custom/path')
        })

        it('should use workspace folder when path is not provided', () => {
            const grepSearch = new GrepSearch({
                query: 'test-query',
            })

            const result = (grepSearch as any).getSearchDirectory()
            assert.strictEqual(result, mockWorkspacePath)
        })
    })

    describe('validate', () => {
        it('should throw an error if query is empty', async () => {
            const grepSearch = new GrepSearch({ query: '' })
            await assert.rejects(async () => await grepSearch.validate(), /Grep search query cannot be empty/)
        })

        it('should throw an error if query is only whitespace', async () => {
            const grepSearch = new GrepSearch({ query: '   ' })

            await assert.rejects(async () => await grepSearch.validate(), /Grep search query cannot be empty/)
        })

        it('should throw an error if path does not exist', async () => {
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

        it('should pass validation with valid query and path', async () => {
            const grepSearch = new GrepSearch({
                query: 'test-query',
                path: '/valid/path',
            })
            await assert.doesNotReject(async () => await grepSearch.validate())
        })
    })

    describe('queueDescription', () => {
        it('should write description to updates stream', () => {
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

    describe('invoke', () => {
        let grepSearch: GrepSearch
        beforeEach(async () => {
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

        it('should execute ripgrep and return results', async () => {
            const result = await grepSearch.invoke()
            assert.deepStrictEqual(result, {
                output: {
                    kind: OutputKind.Text,
                    content: 'processed-results',
                },
            })
        })

        it('should write updates to the provided stream', async () => {
            await grepSearch.invoke(mockUpdates)

            // eslint-disable-next-line @typescript-eslint/unbound-method
            sinon.assert.calledWith(mockUpdates.write as sinon.SinonSpy, '\n\n5 matches found:\n\n')
            // eslint-disable-next-line @typescript-eslint/unbound-method
            sinon.assert.calledWith(mockUpdates.write as sinon.SinonSpy, 'processed-results')
        })

        it('should throw an error if ripgrep execution fails', async () => {
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

    describe('executeRipgrep', () => {
        beforeEach(async () => {
            // Setup the run method to return a successful result
            const mockRun = sandbox.stub().resolves({ stdout: 'search-results', stderr: '', exitCode: 0 })
            sandbox.stub(ChildProcess.prototype, 'run').callsFake(mockRun)
        })

        it('should use case insensitive search by default', async () => {
            const grepSearch = new GrepSearch({
                query: 'test-query',
                path: '/test/path',
            })

            // Mock processRipgrepOutput
            sandbox.stub(grepSearch as any, 'processRipgrepOutput').returns({
                sanitizedOutput: 'processed-results',
                totalMatchCount: 5,
            })

            // Get the existing stub
            // eslint-disable-next-line @typescript-eslint/unbound-method
            const runStub = ChildProcess.prototype.run as sinon.SinonStub

            await (grepSearch as any).executeRipgrep()

            // Check the arguments passed to the stub
            const args = runStub.getCall(0).thisValue.args
            assert.ok(args.includes('-i'), 'Should include -i flag for case insensitive search')
        })

        it('should use case sensitive search when specified', async () => {
            // Create a new sandbox for this test
            sandbox.restore()
            sandbox = sinon.createSandbox()

            // Setup the stub again for this test
            const mockRun = sandbox.stub().resolves({ stdout: 'search-results', stderr: '', exitCode: 0 })
            sandbox.stub(ChildProcess.prototype, 'run').callsFake(mockRun)

            const caseSensitiveGrepSearch = new GrepSearch({
                query: 'test-query',
                path: '/test/path',
                caseSensitive: true,
            })

            // Re-stub processRipgrepOutput for the new instance
            sandbox.stub(caseSensitiveGrepSearch as any, 'processRipgrepOutput').returns({
                sanitizedOutput: 'processed-results',
                totalMatchCount: 5,
            })

            await (caseSensitiveGrepSearch as any).executeRipgrep()

            // Get the stub after it's been called
            // eslint-disable-next-line @typescript-eslint/unbound-method
            const runStub = ChildProcess.prototype.run as sinon.SinonStub
            const args = runStub.getCall(0).thisValue.args
            assert.ok(!args.includes('-i'), 'Should not include -i flag for case sensitive search')
        })

        it('should add include pattern when specified', async () => {
            // Create a new sandbox for this test
            sandbox.restore()
            sandbox = sinon.createSandbox()

            // Setup the stub again for this test
            const mockRun = sandbox.stub().resolves({ stdout: 'search-results', stderr: '', exitCode: 0 })
            sandbox.stub(ChildProcess.prototype, 'run').callsFake(mockRun)

            const includeGrepSearch = new GrepSearch({
                query: 'test-query',
                path: '/test/path',
                includePattern: '*.ts',
            })

            // Re-stub processRipgrepOutput for the new instance
            sandbox.stub(includeGrepSearch as any, 'processRipgrepOutput').returns({
                sanitizedOutput: 'processed-results',
                totalMatchCount: 5,
            })

            await (includeGrepSearch as any).executeRipgrep()

            // Get the stub after it's been called
            // eslint-disable-next-line @typescript-eslint/unbound-method
            const runStub = ChildProcess.prototype.run as sinon.SinonStub
            const args = runStub.getCall(0).thisValue.args
            const globIndex = args.indexOf('--glob')
            assert.ok(globIndex !== -1, 'Should include --glob flag')
            assert.strictEqual(args[globIndex + 1], '*.ts', 'Should include the pattern')
        })

        it('should add exclude pattern when specified', async () => {
            // Create a new sandbox for this test
            sandbox.restore()
            sandbox = sinon.createSandbox()

            // Setup the stub again for this test
            const mockRun = sandbox.stub().resolves({ stdout: 'search-results', stderr: '', exitCode: 0 })
            sandbox.stub(ChildProcess.prototype, 'run').callsFake(mockRun)

            const excludeGrepSearch = new GrepSearch({
                query: 'test-query',
                path: '/test/path',
                excludePattern: '*.log',
            })

            // Re-stub processRipgrepOutput for the new instance
            sandbox.stub(excludeGrepSearch as any, 'processRipgrepOutput').returns({
                sanitizedOutput: 'processed-results',
                totalMatchCount: 5,
            })

            await (excludeGrepSearch as any).executeRipgrep()

            // Get the stub after it's been called
            // eslint-disable-next-line @typescript-eslint/unbound-method
            const runStub = ChildProcess.prototype.run as sinon.SinonStub
            const args = runStub.getCall(0).thisValue.args
            const globIndex = args.indexOf('--glob')
            assert.ok(globIndex !== -1, 'Should include --glob flag')
            assert.strictEqual(args[globIndex + 1], '!*.log', 'Should include the negated pattern')
        })

        it('should handle multiple include patterns', async () => {
            // Create a new sandbox for this test
            sandbox.restore()
            sandbox = sinon.createSandbox()

            // Setup the stub again for this test
            const mockRun = sandbox.stub().resolves({ stdout: 'search-results', stderr: '', exitCode: 0 })
            sandbox.stub(ChildProcess.prototype, 'run').callsFake(mockRun)

            const multiIncludeGrepSearch = new GrepSearch({
                query: 'test-query',
                path: '/test/path',
                includePattern: '*.ts, *.js',
            })

            // Re-stub processRipgrepOutput for the new instance
            sandbox.stub(multiIncludeGrepSearch as any, 'processRipgrepOutput').returns({
                sanitizedOutput: 'processed-results',
                totalMatchCount: 5,
            })

            await (multiIncludeGrepSearch as any).executeRipgrep()

            // Get the stub after it's been called
            // eslint-disable-next-line @typescript-eslint/unbound-method
            const runStub = ChildProcess.prototype.run as sinon.SinonStub
            const args = runStub.getCall(0).thisValue.args

            // Check for both patterns
            const globIndices = args.reduce((indices: number[], arg: string, index: number) => {
                if (arg === '--glob') {
                    indices.push(index)
                }
                return indices
            }, [])

            assert.strictEqual(globIndices.length, 2, 'Should have two --glob flags')
            assert.strictEqual(args[globIndices[0] + 1], '*.ts', 'First pattern should be *.ts')
            assert.strictEqual(args[globIndices[1] + 1], '*.js', 'Second pattern should be *.js')
        })

        it('should handle multiple exclude patterns', async () => {
            // Create a new sandbox for this test
            sandbox.restore()
            sandbox = sinon.createSandbox()

            // Setup the stub again for this test
            const mockRun = sandbox.stub().resolves({ stdout: 'search-results', stderr: '', exitCode: 0 })
            sandbox.stub(ChildProcess.prototype, 'run').callsFake(mockRun)

            const multiExcludeGrepSearch = new GrepSearch({
                query: 'test-query',
                path: '/test/path',
                excludePattern: '*.log, *.tmp',
            })

            // Re-stub processRipgrepOutput for the new instance
            sandbox.stub(multiExcludeGrepSearch as any, 'processRipgrepOutput').returns({
                sanitizedOutput: 'processed-results',
                totalMatchCount: 5,
            })

            await (multiExcludeGrepSearch as any).executeRipgrep()

            // Get the stub after it's been called
            // eslint-disable-next-line @typescript-eslint/unbound-method
            const runStub = ChildProcess.prototype.run as sinon.SinonStub
            const args = runStub.getCall(0).thisValue.args

            // Check for both patterns
            const globIndices = args.reduce((indices: number[], arg: string, index: number) => {
                if (arg === '--glob') {
                    indices.push(index)
                }
                return indices
            }, [])

            assert.strictEqual(globIndices.length, 2, 'Should have two --glob flags')
            assert.strictEqual(args[globIndices[0] + 1], '!*.log', 'First pattern should be !*.log')
            assert.strictEqual(args[globIndices[1] + 1], '!*.tmp', 'Second pattern should be !*.tmp')
        })

        it('should handle ripgrep exit code 1 (no matches)', async () => {
            sandbox.restore()
            sandbox = sinon.createSandbox()

            // Setup ChildProcess to simulate exit code 1 (no matches found)
            const error = new Error()
            error.name = 'ChildProcessError'
            ;(error as any).code = 1

            sandbox.stub(ChildProcess.prototype, 'run').rejects(error)

            const grepSearch = new GrepSearch({
                query: 'no-matches-query',
                path: '/test/path',
            })

            // Mock processRipgrepOutput for empty results
            sandbox.stub(grepSearch as any, 'processRipgrepOutput').returns({
                sanitizedOutput: 'No matches found.',
                totalMatchCount: 0,
            })

            // This should not throw an error since code 1 is handled in rejectOnErrorCode
            const result = await grepSearch.invoke()

            // Should still return a valid output
            assert.deepStrictEqual(result.output.kind, OutputKind.Text)
            assert.deepStrictEqual(result.output.content, 'No matches found.')
        })
    })

    describe('processRipgrepOutput', () => {
        let grepSearch: GrepSearch

        beforeEach(() => {
            grepSearch = new GrepSearch({
                query: 'test-query',
                path: '/test/path',
            })

            // Mock vscode.Uri.file and with
            sandbox.stub(vscode.Uri, 'file').callsFake((filePath) => {
                return {
                    with: (options: any) => {
                        return {
                            toString: () => `file://${filePath}#${options.fragment}`,
                        }
                    },
                    toString: () => `file://${filePath}`,
                } as any
            })
        })

        it('should handle empty output', () => {
            const { sanitizedOutput, totalMatchCount } = (grepSearch as any).processRipgrepOutput('')

            assert.strictEqual(sanitizedOutput, 'No matches found.')
            assert.strictEqual(totalMatchCount, 0)
        })

        it('should process ripgrep output and group by file', () => {
            const mockOutput =
                '/test/file1.ts:10:some match content\n' +
                '/test/file1.ts:20:another match\n' +
                '/test/file2.ts:5:match in another file'

            const { sanitizedOutput, totalMatchCount } = (grepSearch as any).processRipgrepOutput(mockOutput)

            assert.strictEqual(totalMatchCount, 3)

            // Check that output contains details tags
            assert.ok(sanitizedOutput.includes('<details>'))
            assert.ok(sanitizedOutput.includes('</details>'))

            // Check that output contains file names
            assert.ok(sanitizedOutput.includes('file1.ts - match count: (2)'))
            assert.ok(sanitizedOutput.includes('file2.ts - match count: (1)'))

            // Check that output contains line numbers as links
            assert.ok(sanitizedOutput.includes('[Line 10]'))
            assert.ok(sanitizedOutput.includes('[Line 20]'))
            assert.ok(sanitizedOutput.includes('[Line 5]'))

            // Check that files are sorted by match count (most matches first)
            const file1Index = sanitizedOutput.indexOf('file1.ts')
            const file2Index = sanitizedOutput.indexOf('file2.ts')
            assert.ok(file1Index < file2Index, 'Files should be sorted by match count')
        })

        it('should handle malformed output lines', () => {
            const mockOutput =
                '/test/file1.ts:10:some match content\n' +
                'malformed line without colon\n' +
                '/test/file2.ts:5:match in another file'

            const { sanitizedOutput, totalMatchCount } = (grepSearch as any).processRipgrepOutput(mockOutput)

            assert.strictEqual(totalMatchCount, 2)

            // Check that output contains details tags
            assert.ok(sanitizedOutput.includes('<details>'))
            assert.ok(sanitizedOutput.includes('</details>'))

            // Check that output contains file names
            assert.ok(sanitizedOutput.includes('file1.ts - match count: (1)'))
            assert.ok(sanitizedOutput.includes('file2.ts - match count: (1)'))

            // Check that malformed line was skipped
            assert.ok(!sanitizedOutput.includes('malformed'))
        })
    })

    describe('createOutput', () => {
        it('should create output with content', () => {
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

        it('should create output with default message when content is empty', () => {
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
