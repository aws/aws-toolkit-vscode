/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { ResourcesManager } from '../../../../awsService/cloudformation/resources/resourcesManager'
import { ResourceSelector } from '../../../../awsService/cloudformation/ui/resourceSelector'
import {
    ResourceStateResult,
    ResourceStatePurpose,
} from '../../../../awsService/cloudformation/resources/resourceRequestTypes'
import { Range, SnippetString, TextEditor, window } from 'vscode'
import { getLogger } from '../../../../shared/logger'
import globals from '../../../../shared/extensionGlobals'
import * as setContextModule from '../../../../shared/vscode/setContext'
import { getTestWindow } from '../../../shared/vscode/window'
import { SeverityLevel } from '../../../shared/vscode/message'

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

describe('ResourcesManager - removeResourceType', () => {
    let sandbox: sinon.SinonSandbox
    let mockClient: any
    let mockResourceSelector: ResourceSelector
    let resourcesManager: ResourcesManager
    let globalStateStub: sinon.SinonStub

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        mockClient = { sendRequest: sandbox.stub() }
        mockResourceSelector = {} as ResourceSelector
        globalStateStub = sandbox.stub(globals.globalState, 'update').resolves()
        sandbox.stub(globals.globalState, 'tryGet').returns(['AWS::S3::Bucket', 'AWS::Lambda::Function'])
        resourcesManager = new ResourcesManager(mockClient, mockResourceSelector)
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('should remove resource type from selected types', async () => {
        await resourcesManager.removeResourceType('AWS::S3::Bucket')

        assert.ok(globalStateStub.calledOnce)
        const [key, updatedTypes] = globalStateStub.firstCall.args
        assert.strictEqual(key, 'aws.cloudformation.selectedResourceTypes')
        assert.deepStrictEqual(updatedTypes, ['AWS::Lambda::Function'])
    })

    it('should notify listeners after removing resource type', async () => {
        const listener = sandbox.stub()
        resourcesManager.addListener(listener)

        await resourcesManager.removeResourceType('AWS::Lambda::Function')

        assert.ok(listener.calledOnce)
    })

    it('should handle removing non-existent resource type', async () => {
        await resourcesManager.removeResourceType('AWS::DynamoDB::Table')

        assert.ok(globalStateStub.calledOnce)
        const [, updatedTypes] = globalStateStub.firstCall.args
        assert.deepStrictEqual(updatedTypes, ['AWS::S3::Bucket', 'AWS::Lambda::Function'])
    })
})

describe('ResourcesManager - formatFailureReasons and renderResultMessage', () => {
    let sandbox: sinon.SinonSandbox
    let mockClient: any
    let mockResourceSelector: ResourceSelector
    let resourcesManager: ResourcesManager

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        mockClient = { sendRequest: sandbox.stub() }
        mockResourceSelector = {} as ResourceSelector
        resourcesManager = new ResourcesManager(mockClient, mockResourceSelector)
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('should return empty string when failureReasons is undefined', () => {
        const result = (resourcesManager as any).formatFailureReasons(undefined)
        assert.strictEqual(result, '')
    })

    it('should return empty string when failureReasons is empty', () => {
        const result = (resourcesManager as any).formatFailureReasons({})
        assert.strictEqual(result, '')
    })

    it('should format single failure reason', () => {
        const failureReasons = {
            'AWS::S3::Bucket': { 'my-bucket': 'Resource not found' },
        }
        const result = (resourcesManager as any).formatFailureReasons(failureReasons)
        assert.strictEqual(result, ': [my-bucket: Resource not found]')
    })

    it('should format multiple failure reasons across resource types', () => {
        const failureReasons = {
            'AWS::S3::Bucket': { 'my-bucket': 'Resource not found' },
            'AWS::Lambda::Function': { 'my-func': 'Access denied' },
        }
        const result = (resourcesManager as any).formatFailureReasons(failureReasons)
        assert.strictEqual(result, ': [my-bucket: Resource not found], [my-func: Access denied]')
    })

    it('should format multiple identifiers within same resource type', () => {
        const failureReasons = {
            'AWS::S3::Bucket': { 'bucket-1': 'Not found', 'bucket-2': 'Permission denied' },
        }
        const result = (resourcesManager as any).formatFailureReasons(failureReasons)
        assert.strictEqual(result, ': [bucket-1: Not found], [bucket-2: Permission denied]')
    })

    it('should append failure reasons to warning message on partial failure', () => {
        const failureReasons = { 'AWS::S3::Bucket': { 'my-bucket': 'Not found' } }
        ;(resourcesManager as any).renderResultMessage(1, 1, ResourceStatePurpose.Import, failureReasons)
        const message = getTestWindow().getFirstMessage()
        assert.ok(message.message.includes('[my-bucket: Not found]'))
        message.assertSeverity(SeverityLevel.Warning)
    })

    it('should append failure reasons to error message on full failure', () => {
        const failureReasons = { 'AWS::S3::Bucket': { 'my-bucket': 'Access denied' } }
        ;(resourcesManager as any).renderResultMessage(0, 1, ResourceStatePurpose.Import, failureReasons)
        const message = getTestWindow().getFirstMessage()
        assert.ok(message.message.includes('[my-bucket: Access denied]'))
        message.assertSeverity(SeverityLevel.Error)
    })

    it('should not append reasons suffix when failureReasons is undefined', () => {
        ;(resourcesManager as any).renderResultMessage(0, 1, ResourceStatePurpose.Import, undefined)
        const message = getTestWindow().getFirstMessage()
        assert.strictEqual(message.message, 'Failed to import 1 resource(s)')
        message.assertSeverity(SeverityLevel.Error)
    })

    it('should show success message without reasons suffix', () => {
        ;(resourcesManager as any).renderResultMessage(2, 0, ResourceStatePurpose.Import, undefined)
        const message = getTestWindow().getFirstMessage()
        assert.strictEqual(message.message, 'Successfully imported 2 resource(s)')
        message.assertSeverity(SeverityLevel.Information)
    })

    it('should use cloned action with failure reasons', () => {
        const failureReasons = { 'AWS::S3::Bucket': { 'my-bucket': 'Access denied' } }
        ;(resourcesManager as any).renderResultMessage(0, 1, ResourceStatePurpose.Clone, failureReasons)
        const message = getTestWindow().getFirstMessage()
        assert.ok(message.message.includes('clone'))
        assert.ok(message.message.includes('[my-bucket: Access denied]'))
        message.assertSeverity(SeverityLevel.Error)
    })

    it('should show no resources cloned message', () => {
        ;(resourcesManager as any).renderResultMessage(0, 0, ResourceStatePurpose.Clone, undefined)
        const message = getTestWindow().getFirstMessage()
        assert.strictEqual(message.message, 'No resources were cloned')
        message.assertSeverity(SeverityLevel.Information)
    })

    describe('importResourceStates end-to-end', () => {
        beforeEach(() => {
            sandbox.stub(setContextModule, 'setContext').resolves()
            sandbox.stub(window, 'activeTextEditor').get(() => ({
                insertSnippet: sandbox.stub().resolves(true),
                edit: sandbox.stub().resolves(true),
                document: {
                    uri: { toString: () => 'file:///test.yaml' },
                    lineCount: 100,
                    lineAt: sandbox.stub().returns({ range: { end: { line: 99, character: 0 } } }),
                },
            }))
            sandbox.stub(getLogger(), 'warn')
            sandbox.stub(getLogger(), 'info')
        })

        it('should pass failureReasons through the full import flow', async () => {
            mockClient.sendRequest.resolves({
                successfulImports: {},
                failedImports: { 'AWS::S3::Bucket': ['my-bucket'] },
                failureReasons: { 'AWS::S3::Bucket': { 'my-bucket': 'Resource not found in account' } },
            })

            const resourceNodes = [{ resourceType: 'AWS::S3::Bucket', resourceIdentifier: 'my-bucket' }] as any
            await resourcesManager.importResourceStates(resourceNodes)

            const messages = getTestWindow().shownMessages.filter((m) => m.message !== 'Importing Resource State')
            assert.ok(messages.length > 0, `No non-progress messages shown`)
            assert.ok(messages[0].message.includes('[my-bucket: Resource not found in account]'))
        })
    })
})
