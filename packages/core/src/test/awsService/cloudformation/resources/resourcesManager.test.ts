/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { ResourcesManager } from '../../../../awsService/cloudformation/resources/resourcesManager'
import { ResourceSelector } from '../../../../awsService/cloudformation/ui/resourceSelector'
import { ResourceStateResult } from '../../../../awsService/cloudformation/cfn/resourceRequestTypes'
import { Range, SnippetString, TextEditor, window } from 'vscode'
import { getLogger } from '../../../../shared/logger'

describe('ResourcesManager - applyCompletionSnippet', () => {
    let sandbox: sinon.SinonSandbox
    let mockClient: any
    let mockResourceSelector: ResourceSelector
    let resourcesManager: ResourcesManager
    let mockEditor: Partial<TextEditor>
    let windowStub: sinon.SinonStub
    const baseResourceStateResult = {
        successfulImports: new Map(),
        failedImports: new Map(),
    }

    const createResult = (overrides?: Partial<ResourceStateResult>): ResourceStateResult => ({
        ...baseResourceStateResult,
        ...overrides,
    })

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        mockClient = {
            sendRequest: sandbox.stub(),
        }
        mockResourceSelector = {} as ResourceSelector

        mockEditor = {
            insertSnippet: sandbox.stub().resolves(true),
            edit: sandbox.stub().resolves(true),
            document: {
                lineCount: 100,
                lineAt: sandbox.stub().returns({ range: { end: { line: 99, character: 0 } } }),
            } as any,
        }

        windowStub = sandbox.stub(window, 'activeTextEditor').get(() => mockEditor)

        sandbox.stub(getLogger(), 'warn')
        sandbox.stub(getLogger(), 'info')
        sandbox.stub(getLogger(), 'error')

        resourcesManager = new ResourcesManager(mockClient, mockResourceSelector)
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('should insert snippet at server-provided position', async () => {
        const result = createResult({
            completionItem: {
                label: 'Import Resource',
                textEdit: {
                    range: {
                        start: { line: 5, character: 10 },
                        end: { line: 5, character: 10 },
                    },
                    newText: '  "MyBucket": {\n    "Type": "AWS::S3::Bucket"\n  }',
                },
            },
        })

        await (resourcesManager as any).applyCompletionSnippet(result)

        assert.ok((mockEditor.insertSnippet as sinon.SinonStub).calledOnce)
        const [snippetArg, rangeArg] = (mockEditor.insertSnippet as sinon.SinonStub).firstCall.args

        assert.ok(snippetArg instanceof SnippetString)
        assert.strictEqual(snippetArg.value, result.completionItem!.textEdit!.newText)

        assert.ok(rangeArg instanceof Range)
        assert.strictEqual(rangeArg.start.line, 5)
        assert.strictEqual(rangeArg.start.character, 10)
        assert.strictEqual(rangeArg.end.line, 5)
        assert.strictEqual(rangeArg.end.character, 10)
    })

    it('should handle snippet with tabstops', async () => {
        const result = createResult({
            completionItem: {
                label: 'Clone Resource',
                textEdit: {
                    range: {
                        start: { line: 10, character: 0 },
                        end: { line: 10, character: 0 },
                    },
                    newText: '"BucketName": "${1:enter new identifier for MyBucket}"',
                },
            },
        })

        await (resourcesManager as any).applyCompletionSnippet(result)

        assert.ok((mockEditor.insertSnippet as sinon.SinonStub).calledOnce)
        const [snippetArg] = (mockEditor.insertSnippet as sinon.SinonStub).firstCall.args
        assert.strictEqual(snippetArg.value, result.completionItem!.textEdit!.newText)
    })

    it('should not insert when completionItem is missing', async () => {
        const result = createResult()

        await (resourcesManager as any).applyCompletionSnippet(result)

        assert.ok((mockEditor.insertSnippet as sinon.SinonStub).notCalled)
    })

    it('should not insert when textEdit is missing', async () => {
        const result = createResult({
            completionItem: {
                label: 'Test',
            },
        })

        await (resourcesManager as any).applyCompletionSnippet(result)

        assert.ok((mockEditor.insertSnippet as sinon.SinonStub).notCalled)
    })

    it('should not insert when no active editor', async () => {
        windowStub.get(() => undefined)

        const result = createResult({
            completionItem: {
                label: 'Test',
                textEdit: {
                    range: {
                        start: { line: 0, character: 0 },
                        end: { line: 0, character: 0 },
                    },
                    newText: 'test',
                },
            },
        })

        await (resourcesManager as any).applyCompletionSnippet(result)

        assert.ok((mockEditor.insertSnippet as sinon.SinonStub).notCalled)
    })

    it('should handle different range positions', async () => {
        const result = createResult({
            completionItem: {
                label: 'Test',
                textEdit: {
                    range: {
                        start: { line: 100, character: 50 },
                        end: { line: 105, character: 20 },
                    },
                    newText: 'replacement text',
                },
            },
        })

        await (resourcesManager as any).applyCompletionSnippet(result)

        const [, rangeArg] = (mockEditor.insertSnippet as sinon.SinonStub).firstCall.args
        assert.strictEqual(rangeArg.start.line, 100)
        assert.strictEqual(rangeArg.start.character, 50)
        assert.strictEqual(rangeArg.end.line, 105)
        assert.strictEqual(rangeArg.end.character, 20)
    })

    it('should handle multi-line snippet text', async () => {
        const multiLineText = `"MyResource": {
    "Type": "AWS::S3::Bucket",
    "Properties": {
        "BucketName": "\${1:enter new identifier}"
    }
}`

        const result = createResult({
            completionItem: {
                label: 'Test',
                textEdit: {
                    range: {
                        start: { line: 20, character: 4 },
                        end: { line: 20, character: 4 },
                    },
                    newText: multiLineText,
                },
            },
        })

        await (resourcesManager as any).applyCompletionSnippet(result)

        assert.ok((mockEditor.insertSnippet as sinon.SinonStub).calledOnce)
        const [snippetArg] = (mockEditor.insertSnippet as sinon.SinonStub).firstCall.args
        assert.strictEqual(snippetArg.value, multiLineText)
    })

    it('should add newlines when target line does not exist', async () => {
        const mockDocument = {
            lineCount: 10,
            lineAt: sinon.stub().returns({ range: { end: { line: 9, character: 20 } } }),
        }
        ;(mockEditor as any).document = mockDocument
        ;(mockEditor as any).edit = sinon.stub().resolves(true)

        const result = createResult({
            completionItem: {
                label: 'Test',
                textEdit: {
                    range: {
                        start: { line: 15, character: 0 },
                        end: { line: 15, character: 0 },
                    },
                    newText: 'test content',
                },
            },
        })

        await (resourcesManager as any).applyCompletionSnippet(result)

        // Should call edit to add newlines
        assert.ok(((mockEditor as any).edit as sinon.SinonStub).calledOnce)

        // Should still call insertSnippet
        assert.ok((mockEditor.insertSnippet as sinon.SinonStub).calledOnce)
    })
})
