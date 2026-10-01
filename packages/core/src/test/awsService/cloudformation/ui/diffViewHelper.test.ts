/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import * as path from 'path'
import * as os from 'os'
import { DiffViewHelper } from '../../../../awsService/cloudformation/ui/diffViewHelper'
import { StackChange } from '../../../../awsService/cloudformation/stacks/actions/stackActionRequestType'
import { fs } from '../../../../shared/fs/fs'

describe('DiffViewHelper', function () {
    let sandbox: sinon.SinonSandbox
    let writeFileStub: sinon.SinonStub
    let executeCommandStub: sinon.SinonStub
    let openTextDocumentStub: sinon.SinonStub

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        writeFileStub = sandbox.stub(fs, 'writeFile')
        executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand')
        openTextDocumentStub = sandbox.stub(vscode.workspace, 'openTextDocument')
    })

    afterEach(function () {
        sandbox.restore()
    })

    async function testDiffGeneration(stackName: string, changes: StackChange[]) {
        await DiffViewHelper.openDiff(stackName, changes)

        const tmpDir = os.tmpdir()
        const beforePath = path.join(tmpDir, `${stackName}-before.json`)
        const afterPath = path.join(tmpDir, `${stackName}-after.json`)

        return { beforePath, afterPath }
    }

    function assertFileCallsAndParseData() {
        assert.ok(writeFileStub.calledTwice)
        const beforeCall = writeFileStub.getCall(0)
        const afterCall = writeFileStub.getCall(1)

        const beforeData = JSON.parse(beforeCall.args[1])
        const afterData = JSON.parse(afterCall.args[1])

        return { beforeData, afterData }
    }

    describe('openDiff', function () {
        it('should create diff files and open diff view for Add action', async function () {
            const stackName = 'test-stack'
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Add',
                        logicalResourceId: 'TestResource',
                        afterContext: '{"Type": "AWS::S3::Bucket", "Properties": {"BucketName": "new-bucket"}}',
                    },
                },
            ]

            const { beforePath, afterPath } = await testDiffGeneration(stackName, changes)

            assert.ok(writeFileStub.calledTwice)
            assert.ok(writeFileStub.calledWith(beforePath, '{}'))
            assert.ok(writeFileStub.calledWith(afterPath, sinon.match.string))
            assert.ok(
                executeCommandStub.calledWith(
                    'vscode.diff',
                    sinon.match.any,
                    sinon.match.any,
                    `${stackName}: Before ↔ After`
                )
            )
        })

        it('should create diff files and open diff view for Remove action', async function () {
            const stackName = 'test-stack'
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Remove',
                        logicalResourceId: 'TestResource',
                        beforeContext: '{"Type": "AWS::S3::Bucket", "Properties": {"BucketName": "old-bucket"}}',
                    },
                },
            ]

            const { beforePath, afterPath } = await testDiffGeneration(stackName, changes)

            assert.ok(writeFileStub.calledTwice)
            assert.ok(writeFileStub.calledWith(beforePath, sinon.match.string))
            assert.ok(writeFileStub.calledWith(afterPath, '{}'))
            assert.ok(
                executeCommandStub.calledWith(
                    'vscode.diff',
                    sinon.match.any,
                    sinon.match.any,
                    `${stackName}: Before ↔ After`
                )
            )
        })

        it('should create diff files for Modify action with beforeContext and afterContext', async function () {
            const stackName = 'test-stack'
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Modify',
                        logicalResourceId: 'TestResource',
                        beforeContext: '{"Type": "AWS::S3::Bucket", "Properties": {"BucketName": "old-bucket"}}',
                        afterContext: '{"Type": "AWS::S3::Bucket", "Properties": {"BucketName": "new-bucket"}}',
                    },
                },
            ]

            await testDiffGeneration(stackName, changes)

            const { beforeData, afterData } = assertFileCallsAndParseData()

            assert.ok(beforeData.TestResource)
            assert.ok(afterData.TestResource)
        })

        it('should handle Modify action with details when no context provided', async function () {
            const stackName = 'test-stack'
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Modify',
                        logicalResourceId: 'ModifiedResource',
                        details: [
                            {
                                Target: {
                                    Name: 'BucketName',
                                    BeforeValue: 'old-bucket',
                                    AfterValue: 'new-bucket',
                                },
                            },
                        ],
                    },
                },
            ]

            await testDiffGeneration(stackName, changes)

            const { beforeData, afterData } = assertFileCallsAndParseData()

            assert.strictEqual(beforeData.ModifiedResource.BucketName, 'old-bucket')
            assert.strictEqual(afterData.ModifiedResource.BucketName, 'new-bucket')
        })

        it('should handle invalid JSON in context gracefully', async function () {
            const stackName = 'test-stack'
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Modify',
                        logicalResourceId: 'InvalidResource',
                        beforeContext: 'invalid-json',
                        afterContext: 'also-invalid-json',
                    },
                },
            ]

            await DiffViewHelper.openDiff(stackName, changes)

            const { beforeData, afterData } = assertFileCallsAndParseData()

            assert.deepStrictEqual(beforeData.InvalidResource, {})
            assert.deepStrictEqual(afterData.InvalidResource, {})
        })

        it('should skip changes without logicalResourceId', async function () {
            const stackName = 'test-stack'
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Add',
                        // Missing logicalResourceId
                    },
                },
            ]

            await DiffViewHelper.openDiff(stackName, changes)

            assert.ok(writeFileStub.calledTwice)
            assert.ok(writeFileStub.calledWith(sinon.match.any, '{}'))
        })

        it('should open diff with selection when resourceId is provided', async function () {
            const stackName = 'test-stack'
            const resourceId = 'TargetResource'
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Add',
                        logicalResourceId: resourceId,
                        afterContext: '{"Type": "AWS::S3::Bucket"}',
                    },
                },
            ]

            const mockDocument = {
                getText: () => `{\n  "${resourceId}": {\n    "Type": "AWS::S3::Bucket"\n  }\n}`,
            }
            openTextDocumentStub.resolves(mockDocument)

            await DiffViewHelper.openDiff(stackName, changes, resourceId)

            assert.ok(executeCommandStub.calledTwice)
            const secondCall = executeCommandStub.getCall(1)
            assert.ok(secondCall.args[4]?.selection)
        })

        it('should handle resourceId not found in document', async function () {
            const stackName = 'test-stack'
            const resourceId = 'NonExistentResource'
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Add',
                        logicalResourceId: 'DifferentResource',
                        afterContext: '{"Type": "AWS::S3::Bucket"}',
                    },
                },
            ]

            const mockDocument = {
                getText: () => '{\n  "DifferentResource": {\n    "Type": "AWS::S3::Bucket"\n  }\n}',
            }
            openTextDocumentStub.resolves(mockDocument)

            await DiffViewHelper.openDiff(stackName, changes, resourceId)

            // Should only call diff once (without selection)
            assert.ok(executeCommandStub.calledOnce)
        })

        it('should handle details with missing BeforeValue/AfterValue', async function () {
            const stackName = 'test-stack'
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Modify',
                        logicalResourceId: 'ModifiedResource',
                        details: [
                            {
                                Target: {
                                    Name: 'Property1',
                                    // Missing BeforeValue and AfterValue
                                },
                            },
                        ],
                    },
                },
            ]

            await testDiffGeneration(stackName, changes)

            const { beforeData, afterData } = assertFileCallsAndParseData()

            assert.strictEqual(beforeData.ModifiedResource.Property1, '<UnknownBefore>')
            assert.strictEqual(afterData.ModifiedResource.Property1, '<UnknownAfter>')
        })

        it('should handle empty changes array', async function () {
            const stackName = 'test-stack'
            const changes: StackChange[] = []

            await DiffViewHelper.openDiff(stackName, changes)

            assert.ok(writeFileStub.calledTwice)
            assert.ok(writeFileStub.calledWith(sinon.match.any, '{}'))
            assert.ok(executeCommandStub.calledOnce)
        })
    })

    describe('drift decorations', function () {
        let createTextEditorDecorationTypeStub: sinon.SinonStub
        let setDecorationsStub: sinon.SinonStub
        let clock: sinon.SinonFakeTimers

        beforeEach(function () {
            createTextEditorDecorationTypeStub = sandbox.stub(vscode.window, 'createTextEditorDecorationType')
            setDecorationsStub = sandbox.stub()
            clock = sandbox.useFakeTimers()
        })

        function setupMockEditor(stackName: string, documentText: string) {
            const tmpDir = os.tmpdir()
            const beforePath = path.join(tmpDir, `${stackName}-before.json`)
            const beforeUri = vscode.Uri.file(beforePath).toString()

            const mockEditor = {
                document: {
                    uri: { toString: () => beforeUri },
                    getText: () => documentText,
                },
                setDecorations: setDecorationsStub,
            }

            sandbox.stub(vscode.window, 'visibleTextEditors').get(() => [mockEditor])
        }

        async function runDriftTest(stackName: string, changes: StackChange[]) {
            await DiffViewHelper.openDiff(stackName, changes)
            clock.tick(500)
        }

        function assertDecorationCount(expectedCount: number) {
            assert.ok(setDecorationsStub.called)
            const decorations = setDecorationsStub.getCall(0).args[1]
            assert.strictEqual(decorations.length, expectedCount)
            return decorations
        }

        function createDriftChange(
            logicalResourceId: string,
            beforeContext: string,
            afterContext: string,
            details: any[]
        ): StackChange {
            return {
                resourceChange: {
                    action: 'Modify',
                    logicalResourceId,
                    beforeContext,
                    afterContext,
                    details,
                },
            }
        }

        function createDetailTarget(
            name: string,
            path: string,
            beforeValue: string,
            afterValue: string,
            drift?: { PreviousValue: string; ActualValue: string }
        ) {
            return {
                Target: {
                    Name: name,
                    Path: path,
                    BeforeValue: beforeValue,
                    AfterValue: afterValue,
                    ...(drift && { LiveResourceDrift: drift }),
                },
            }
        }

        it('should add drift decoration when LiveResourceDrift is present', async function () {
            const stackName = 'test-stack'
            const changes: StackChange[] = [
                createDriftChange(
                    'MyQueue',
                    '{"Properties":{"DelaySeconds":"5"}}',
                    '{"Properties":{"DelaySeconds":"1"}}',
                    [
                        createDetailTarget('DelaySeconds', '/Properties/DelaySeconds', '5', '1', {
                            PreviousValue: '1',
                            ActualValue: '5',
                        }),
                    ]
                ),
            ]

            setupMockEditor(
                stackName,
                '{\n  "MyQueue": {\n    "Properties": {\n      "DelaySeconds": "5"\n    }\n  }\n}'
            )
            await runDriftTest(stackName, changes)

            assert.ok(createTextEditorDecorationTypeStub.called)
            const decorations = assertDecorationCount(1)
            assert.ok(decorations[0].hoverMessage.includes('Resource Drift Detected'))
            assert.ok(decorations[0].hoverMessage.includes('MyQueue'))
        })

        it('should not add decoration when LiveResourceDrift is not present', async function () {
            const stackName = 'test-stack'
            const changes: StackChange[] = [
                createDriftChange(
                    'MyQueue',
                    '{"Properties":{"DelaySeconds":"5"}}',
                    '{"Properties":{"DelaySeconds":"1"}}',
                    [createDetailTarget('DelaySeconds', '/Properties/DelaySeconds', '5', '1')]
                ),
            ]

            setupMockEditor(
                stackName,
                '{\n  "MyQueue": {\n    "Properties": {\n      "DelaySeconds": "5"\n    }\n  }\n}'
            )
            await runDriftTest(stackName, changes)

            assertDecorationCount(0)
        })

        it('should handle nested property paths correctly', async function () {
            const stackName = 'test-stack'
            const changes: StackChange[] = [
                createDriftChange(
                    'MyResource',
                    '{"Properties":{"Config":{"Setting":"old"}}}',
                    '{"Properties":{"Config":{"Setting":"new"}}}',
                    [
                        createDetailTarget('Setting', '/Properties/Config/Setting', 'old', 'new', {
                            PreviousValue: 'new',
                            ActualValue: 'old',
                        }),
                    ]
                ),
            ]

            setupMockEditor(
                stackName,
                '{\n  "MyResource": {\n    "Properties": {\n      "Config": {\n        "Setting": "old"\n      }\n    }\n  }\n}'
            )
            await runDriftTest(stackName, changes)

            const decorations = assertDecorationCount(1)
            assert.ok(decorations[0].hoverMessage.includes('/Properties/Config/Setting'))
        })

        it('should handle multiple drift decorations for different properties', async function () {
            const stackName = 'test-stack'
            const changes: StackChange[] = [
                createDriftChange(
                    'MyQueue',
                    '{"Properties":{"DelaySeconds":"5","MessageRetentionPeriod":"100"}}',
                    '{"Properties":{"DelaySeconds":"1","MessageRetentionPeriod":"200"}}',
                    [
                        createDetailTarget('DelaySeconds', '/Properties/DelaySeconds', '5', '1', {
                            PreviousValue: '1',
                            ActualValue: '5',
                        }),
                        createDetailTarget(
                            'MessageRetentionPeriod',
                            '/Properties/MessageRetentionPeriod',
                            '100',
                            '200',
                            { PreviousValue: '100', ActualValue: '150' }
                        ),
                    ]
                ),
            ]

            setupMockEditor(
                stackName,
                '{\n  "MyQueue": {\n    "Properties": {\n      "DelaySeconds": "5",\n      "MessageRetentionPeriod": "100"\n    }\n  }\n}'
            )
            await runDriftTest(stackName, changes)

            assertDecorationCount(2)
        })

        it('should add drift decoration for DELETED resources', async function () {
            const stackName = 'test-stack'
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        logicalResourceId: 'DeletedResource',
                        resourceDriftStatus: 'DELETED',
                    },
                },
            ]

            setupMockEditor(stackName, '{\n  "DeletedResource": {}\n}')
            await runDriftTest(stackName, changes)

            const decorations = assertDecorationCount(1)
            assert.ok(decorations[0].hoverMessage.includes('Resource Deleted'))
            assert.ok(decorations[0].hoverMessage.includes('deleted sometime after the previous deployment'))
        })

        it('should handle array indices in property paths', async function () {
            const stackName = 'test-stack'
            const changes: StackChange[] = [
                createDriftChange(
                    'MyRole',
                    '{"Properties":{"Policies":[{"PolicyDocument":"old"}]}}',
                    '{"Properties":{"Policies":[{"PolicyDocument":"new"}]}}',
                    [
                        createDetailTarget('PolicyDocument', '/Properties/Policies/0/PolicyDocument', 'old', 'new', {
                            PreviousValue: 'old',
                            ActualValue: 'drifted',
                        }),
                    ]
                ),
            ]

            setupMockEditor(
                stackName,
                '{\n  "MyRole": {\n    "Properties": {\n      "Policies": [\n        {\n          "PolicyDocument": "old"\n        }\n      ]\n    }\n  }\n}'
            )
            await runDriftTest(stackName, changes)

            const decorations = assertDecorationCount(1)
            assert.ok(decorations[0].hoverMessage.includes('/Properties/Policies/0/PolicyDocument'))
        })

        it('should not add decoration when property is not in afterContext', async function () {
            const stackName = 'test-stack'
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Modify',
                        logicalResourceId: 'MyQueue',
                        beforeContext: '{"Properties":{"DelaySeconds":"5","MessageRetentionPeriod":"100"}}',
                        afterContext: '{"Properties":{"MessageRetentionPeriod":"200"}}',
                        details: [
                            {
                                Target: {
                                    Name: 'DelaySeconds',
                                    Path: '/Properties/DelaySeconds',
                                    BeforeValue: '5',
                                    AfterValue: '1',
                                    Drift: {
                                        PreviousValue: '1',
                                        ActualValue: '5',
                                    },
                                },
                            },
                        ],
                    },
                },
            ]

            setupMockEditor(
                stackName,
                '{\n  "MyQueue": {\n    "Properties": {\n      "DelaySeconds": "5",\n      "MessageRetentionPeriod": "100"\n    }\n  }\n}'
            )
            await runDriftTest(stackName, changes)

            assertDecorationCount(0)
        })

        it('should not add decoration when ActualValue is undefined', async function () {
            const stackName = 'test-stack'
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Modify',
                        logicalResourceId: 'MyQueue',
                        beforeContext: '{"Properties":{"DelaySeconds":"5"}}',
                        afterContext: '{"Properties":{"DelaySeconds":"1"}}',
                        details: [
                            {
                                Target: {
                                    Name: 'DelaySeconds',
                                    Path: '/Properties/DelaySeconds',
                                    AfterValue: '1',
                                    Drift: {
                                        PreviousValue: '1',
                                    },
                                },
                            },
                        ],
                    },
                },
            ]

            setupMockEditor(
                stackName,
                '{\n  "MyQueue": {\n    "Properties": {\n      "DelaySeconds": "5"\n    }\n  }\n}'
            )
            await runDriftTest(stackName, changes)

            assertDecorationCount(0)
        })
    })
})
