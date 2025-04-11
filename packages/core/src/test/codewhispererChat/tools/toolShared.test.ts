/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { Writable } from 'stream'
import {
    sanitizePath,
    OutputKind,
    InvokeOutput,
    listDirectoryToolResponseSize,
    fsReadToolResponseSize,
    defaultMaxToolResponseSize,
} from '../../../codewhispererChat/tools/toolShared'
import { ToolUtils, Tool, ToolType } from '../../../codewhispererChat/tools/toolUtils'
import { FsRead } from '../../../codewhispererChat/tools/fsRead'
import { FsWrite } from '../../../codewhispererChat/tools/fsWrite'
import { ExecuteBash } from '../../../codewhispererChat/tools/executeBash'
import { ToolUse } from '@amzn/codewhisperer-streaming'
import path from 'path'
import fs from '../../../shared/fs/fs'
import { ListDirectory } from '../../../codewhispererChat/tools/listDirectory'

describe('ToolUtils', function () {
    let sandbox: sinon.SinonSandbox
    let mockFsRead: sinon.SinonStubbedInstance<FsRead>
    let mockFsWrite: sinon.SinonStubbedInstance<FsWrite>
    let mockExecuteBash: sinon.SinonStubbedInstance<ExecuteBash>
    let mockListDirectory: sinon.SinonStubbedInstance<ListDirectory>
    let mockWritable: sinon.SinonStubbedInstance<Writable>

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        mockFsRead = sandbox.createStubInstance(FsRead)
        mockFsWrite = sandbox.createStubInstance(FsWrite)
        mockExecuteBash = sandbox.createStubInstance(ExecuteBash)
        mockListDirectory = sandbox.createStubInstance(ListDirectory)
        mockWritable = {
            write: sandbox.stub(),
        } as unknown as sinon.SinonStubbedInstance<Writable>
        ;(mockFsRead.requiresAcceptance as sinon.SinonStub).returns({ requiresAcceptance: false })
        ;(mockListDirectory.requiresAcceptance as sinon.SinonStub).returns({ requiresAcceptance: false })
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('displayName', function () {
        it('returns correct display name for FsRead tool', function () {
            const tool: Tool = { type: ToolType.FsRead, tool: mockFsRead as unknown as FsRead }
            assert.strictEqual(ToolUtils.displayName(tool), 'Read from filesystem')
        })

        it('returns correct display name for FsWrite tool', function () {
            const tool: Tool = { type: ToolType.FsWrite, tool: mockFsWrite as unknown as FsWrite }
            assert.strictEqual(ToolUtils.displayName(tool), 'Write to filesystem')
        })

        it('returns correct display name for ExecuteBash tool', function () {
            const tool: Tool = { type: ToolType.ExecuteBash, tool: mockExecuteBash as unknown as ExecuteBash }
            assert.strictEqual(ToolUtils.displayName(tool), 'Execute shell command')
        })

        it('returns correct display name for ListDirectory tool', function () {
            const tool: Tool = { type: ToolType.ListDirectory, tool: mockListDirectory as unknown as ListDirectory }
            assert.strictEqual(ToolUtils.displayName(tool), 'List directory from filesystem')
        })
    })

    describe('requiresAcceptance', function () {
        it('returns false for FsRead tool', function () {
            const tool: Tool = { type: ToolType.FsRead, tool: mockFsRead as unknown as FsRead }
            assert.strictEqual(ToolUtils.requiresAcceptance(tool).requiresAcceptance, false)
        })

        it('returns false for FsWrite tool', function () {
            const tool: Tool = { type: ToolType.FsWrite, tool: mockFsWrite as unknown as FsWrite }
            assert.strictEqual(ToolUtils.requiresAcceptance(tool).requiresAcceptance, false)
        })

        it('delegates to the tool for ExecuteBash', function () {
            mockExecuteBash.requiresAcceptance.returns({ requiresAcceptance: true })
            const tool: Tool = { type: ToolType.ExecuteBash, tool: mockExecuteBash as unknown as ExecuteBash }
            assert.strictEqual(ToolUtils.requiresAcceptance(tool).requiresAcceptance, true)

            mockExecuteBash.requiresAcceptance.returns({ requiresAcceptance: false })
            assert.strictEqual(ToolUtils.requiresAcceptance(tool).requiresAcceptance, false)

            assert(mockExecuteBash.requiresAcceptance.calledTwice)
        })

        it('returns false for ListDirectory tool', function () {
            const tool: Tool = { type: ToolType.ListDirectory, tool: mockListDirectory as unknown as ListDirectory }
            assert.strictEqual(ToolUtils.requiresAcceptance(tool).requiresAcceptance, false)
        })
    })

    describe('invoke', function () {
        it('delegates to FsRead tool invoke method', async function () {
            const expectedOutput: InvokeOutput = {
                output: {
                    kind: OutputKind.Text,
                    content: 'test content',
                },
            }
            mockFsRead.invoke.resolves(expectedOutput)

            const tool: Tool = { type: ToolType.FsRead, tool: mockFsRead as unknown as FsRead }
            const result = await ToolUtils.invoke(tool, mockWritable as unknown as Writable)

            assert.deepStrictEqual(result, expectedOutput)
            assert(mockFsRead.invoke.calledOnceWith(mockWritable as unknown as Writable | undefined))
        })

        it('delegates to FsWrite tool invoke method', async function () {
            const expectedOutput: InvokeOutput = {
                output: {
                    kind: OutputKind.Text,
                    content: 'write success',
                },
            }
            mockFsWrite.invoke.resolves(expectedOutput)

            const tool: Tool = { type: ToolType.FsWrite, tool: mockFsWrite as unknown as FsWrite }
            const result = await ToolUtils.invoke(tool, mockWritable as unknown as Writable)

            assert.deepStrictEqual(result, expectedOutput)
            assert(mockFsWrite.invoke.calledOnceWith(mockWritable as unknown as Writable | undefined))
        })

        it('delegates to ExecuteBash tool invoke method', async function () {
            const expectedOutput: InvokeOutput = {
                output: {
                    kind: OutputKind.Json,
                    content: '{"stdout":"command output","exit_status":"0"}',
                },
            }
            mockExecuteBash.invoke.resolves(expectedOutput)

            const tool: Tool = { type: ToolType.ExecuteBash, tool: mockExecuteBash as unknown as ExecuteBash }
            const result = await ToolUtils.invoke(tool, mockWritable as unknown as Writable)

            assert.deepStrictEqual(result, expectedOutput)
            assert(mockExecuteBash.invoke.calledOnceWith(mockWritable as unknown as Writable | undefined))
        })

        it('delegates to ListDirectory tool invoke method', async function () {
            const expectedOutput: InvokeOutput = {
                output: {
                    kind: OutputKind.Text,
                    content: 'test content',
                },
            }
            mockListDirectory.invoke.resolves(expectedOutput)

            const tool: Tool = { type: ToolType.ListDirectory, tool: mockListDirectory as unknown as ListDirectory }
            const result = await ToolUtils.invoke(tool, mockWritable as unknown as Writable)

            assert.deepStrictEqual(result, expectedOutput)
            assert(mockListDirectory.invoke.calledOnceWith(mockWritable as unknown as Writable | undefined))
        })
    })

    describe('validateOutput', function () {
        it('does not throw error if output is within size limit for fsRead', function () {
            const output: InvokeOutput = {
                output: {
                    kind: OutputKind.Text,
                    content: 'a'.repeat(fsReadToolResponseSize - 1),
                },
            }
            assert.doesNotThrow(() => ToolUtils.validateOutput(output, ToolType.FsRead))
        })
        it('throws error if output exceeds max size for fsRead', function () {
            const output: InvokeOutput = {
                output: {
                    kind: OutputKind.Text,
                    content: 'a'.repeat(fsReadToolResponseSize + 1),
                },
            }
            assert.throws(() => ToolUtils.validateOutput(output, ToolType.FsRead), {
                name: 'Error',
                message: `fsRead output exceeds maximum character limit of ${fsReadToolResponseSize}`,
            })
        })
        it('does not throw error if output is within size limit for listDirectory', function () {
            const output: InvokeOutput = {
                output: {
                    kind: OutputKind.Text,
                    content: 'a'.repeat(listDirectoryToolResponseSize - 1),
                },
            }
            assert.doesNotThrow(() => ToolUtils.validateOutput(output, ToolType.ListDirectory))
        })
        it('throws error if output exceeds max size for listDirectory', function () {
            const output: InvokeOutput = {
                output: {
                    kind: OutputKind.Text,
                    content: 'a'.repeat(listDirectoryToolResponseSize + 1),
                },
            }
            assert.throws(() => ToolUtils.validateOutput(output, ToolType.ListDirectory), {
                name: 'Error',
                message: `listDirectory output exceeds maximum character limit of ${listDirectoryToolResponseSize}`,
            })
        })
        it('does not throw error if output is within size limit for fsWrite', function () {
            const output: InvokeOutput = {
                output: {
                    kind: OutputKind.Text,
                    content: 'a'.repeat(defaultMaxToolResponseSize - 1),
                },
            }
            assert.doesNotThrow(() => ToolUtils.validateOutput(output, ToolType.FsWrite))
        })
        it('does not throw error if output is within size limit for fsWrite', function () {
            const output: InvokeOutput = {
                output: {
                    kind: OutputKind.Text,
                    content: 'a'.repeat(defaultMaxToolResponseSize + 1),
                },
            }
            assert.throws(() => ToolUtils.validateOutput(output, ToolType.FsWrite), {
                name: 'Error',
                message: `fsWrite output exceeds maximum character limit of ${defaultMaxToolResponseSize}`,
            })
        })
    })

    describe('queueDescription', function () {
        // TODO: Adding "void" to the following tests for the current implementation but in the next followup PR I will fix this issue.
        it('delegates to FsRead tool queueDescription method', function () {
            const tool: Tool = { type: ToolType.FsRead, tool: mockFsRead as unknown as FsRead }
            void ToolUtils.queueDescription(tool, mockWritable as unknown as Writable)

            assert(mockFsRead.queueDescription.calledOnceWith(mockWritable))
        })

        it('delegates to FsWrite tool queueDescription method', function () {
            const tool: Tool = { type: ToolType.FsWrite, tool: mockFsWrite as unknown as FsWrite }
            void ToolUtils.queueDescription(tool, mockWritable as unknown as Writable)

            assert(mockFsWrite.queueDescription.calledOnceWith(mockWritable))
        })

        it('delegates to ExecuteBash tool queueDescription method', function () {
            const tool: Tool = { type: ToolType.ExecuteBash, tool: mockExecuteBash as unknown as ExecuteBash }
            void ToolUtils.queueDescription(tool, mockWritable as unknown as Writable)

            assert(mockExecuteBash.queueDescription.calledOnceWith(mockWritable))
        })

        it('delegates to ListDirectory tool queueDescription method', function () {
            const tool: Tool = { type: ToolType.ListDirectory, tool: mockListDirectory as unknown as ListDirectory }
            void ToolUtils.queueDescription(tool, mockWritable as unknown as Writable)

            assert(mockListDirectory.queueDescription.calledOnceWith(mockWritable))
        })
    })

    describe('validate', function () {
        it('delegates to FsRead tool validate method', async function () {
            mockFsRead.validate.resolves()

            const tool: Tool = { type: ToolType.FsRead, tool: mockFsRead as unknown as FsRead }
            await ToolUtils.validate(tool)

            assert(mockFsRead.validate.calledOnce)
        })

        it('delegates to FsWrite tool validate method', async function () {
            mockFsWrite.validate.resolves()

            const tool: Tool = { type: ToolType.FsWrite, tool: mockFsWrite as unknown as FsWrite }
            await ToolUtils.validate(tool)

            assert(mockFsWrite.validate.calledOnce)
        })

        it('delegates to ExecuteBash tool validate method', async function () {
            mockExecuteBash.validate.resolves()

            const tool: Tool = { type: ToolType.ExecuteBash, tool: mockExecuteBash as unknown as ExecuteBash }
            await ToolUtils.validate(tool)

            assert(mockExecuteBash.validate.calledOnce)
        })

        it('delegates to ListDirectory tool validate method', async function () {
            mockListDirectory.validate.resolves()

            const tool: Tool = { type: ToolType.ListDirectory, tool: mockListDirectory as unknown as ListDirectory }
            await ToolUtils.validate(tool)

            assert(mockListDirectory.validate.calledOnce)
        })
    })

    describe('tryFromToolUse', function () {
        it('creates FsRead tool from ToolUse', function () {
            const toolUse: ToolUse = {
                toolUseId: 'test-id',
                name: ToolType.FsRead,
                input: { path: '/test/path', mode: 'Line' },
            }

            const result = ToolUtils.tryFromToolUse(toolUse)

            assert.strictEqual('type' in result, true)
            if ('type' in result) {
                assert.strictEqual(result.type, ToolType.FsRead)
                assert(result.tool instanceof FsRead)
            }
        })

        it('creates FsWrite tool from ToolUse', function () {
            const toolUse: ToolUse = {
                toolUseId: 'test-id',
                name: ToolType.FsWrite,
                input: { command: 'create', path: '/test/path', file_text: 'content' },
            }

            const result = ToolUtils.tryFromToolUse(toolUse)

            assert.strictEqual('type' in result, true)
            if ('type' in result) {
                assert.strictEqual(result.type, ToolType.FsWrite)
                assert(result.tool instanceof FsWrite)
            }
        })

        it('creates ExecuteBash tool from ToolUse', function () {
            const toolUse: ToolUse = {
                toolUseId: 'test-id',
                name: ToolType.ExecuteBash,
                input: { command: 'ls -la' },
            }

            const result = ToolUtils.tryFromToolUse(toolUse)

            assert.strictEqual('type' in result, true)
            if ('type' in result) {
                assert.strictEqual(result.type, ToolType.ExecuteBash)
                assert(result.tool instanceof ExecuteBash)
            }
        })

        it('creates ListDirectory tool from ToolUse', function () {
            const toolUse: ToolUse = {
                toolUseId: 'test-id',
                name: ToolType.ListDirectory,
                input: { path: '/test/path' },
            }

            const result = ToolUtils.tryFromToolUse(toolUse)

            assert.strictEqual('type' in result, true)
            if ('type' in result) {
                assert.strictEqual(result.type, ToolType.ListDirectory)
                assert(result.tool instanceof ListDirectory)
            }
        })

        it('returns error result for unsupported tool', function () {
            const toolUse: ToolUse = {
                toolUseId: 'test-id',
                name: 'UnsupportedTool' as any,
                input: {},
            }

            const result = ToolUtils.tryFromToolUse(toolUse)

            assert.strictEqual('toolUseId' in result, true)
            if ('toolUseId' in result) {
                assert.strictEqual(result.toolUseId, 'test-id')
                assert.strictEqual(
                    result.content?.[0].text ?? '',
                    'The tool, "UnsupportedTool" is not supported by the client'
                )
            }
        })
    })
})

describe('sanitizePath', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('trims whitespace from input path', function () {
        const result = sanitizePath('  /test/path  ')
        assert.strictEqual(result, '/test/path')
    })

    it('expands tilde to user home directory', function () {
        const homeDir = '/Users/testuser'
        sandbox.stub(fs, 'getUserHomeDir').returns(homeDir)

        const result = sanitizePath('~/documents/file.txt')
        assert.strictEqual(result, path.join(homeDir, 'documents/file.txt'))
    })

    it('converts relative paths to absolute paths', function () {
        const result = sanitizePath('relative/path')
        assert.strictEqual(result, path.resolve('relative/path'))
    })

    it('leaves absolute paths unchanged', function () {
        const absolutePath = path.resolve('/absolute/path')
        const result = sanitizePath(absolutePath)
        assert.strictEqual(result, absolutePath)
    })
})
