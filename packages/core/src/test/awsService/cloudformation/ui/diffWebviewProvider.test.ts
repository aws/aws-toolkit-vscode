/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { DiffWebviewProvider } from '../../../../awsService/cloudformation/ui/diffWebviewProvider'
import { StackChange } from '../../../../awsService/cloudformation/stacks/actions/stackActionRequestType'

describe('DiffWebviewProvider', function () {
    let sandbox: sinon.SinonSandbox
    let provider: DiffWebviewProvider

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        const mockCoordinator = {
            onDidChangeStack: sandbox.stub().returns({ dispose: () => {} }),
            setChangeSetMode: sandbox.stub().resolves(),
        } as any
        provider = new DiffWebviewProvider(mockCoordinator)
    })

    afterEach(function () {
        sandbox.restore()
    })

    function createMockWebview() {
        return {
            webview: {
                options: {},
                html: '',
                onDidReceiveMessage: sandbox.stub(),
            },
        }
    }

    function setupProviderWithChanges(stackName: string, changes: StackChange[]) {
        void provider.updateData(stackName, changes)
        const mockWebview = createMockWebview()
        provider.resolveWebviewView(mockWebview as any)
        return mockWebview.webview.html
    }

    describe('updateData', function () {
        it('should update stack name and changes', function () {
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Add',
                        logicalResourceId: 'TestResource',
                        resourceType: 'AWS::S3::Bucket',
                    },
                },
            ]

            const html = setupProviderWithChanges('test-stack', changes)

            // The HTML should contain the resource information (stack name doesn't appear in table HTML)
            assert.ok(html.includes('TestResource'))
            assert.ok(html.includes('Add'))
            assert.ok(html.includes('AWS::S3::Bucket'))
            // Verify it's not the "No changes detected" message
            assert.ok(!html.includes('No changes detected'))
        })

        it('should handle empty changes array', function () {
            const html = setupProviderWithChanges('empty-stack', [])
            assert.ok(html.includes('No changes detected'))
            assert.ok(html.includes('empty-stack'))
        })
    })

    describe('resolveWebviewView', function () {
        it('should configure webview options and set HTML content', function () {
            const mockWebview = createMockWebview()

            void provider.updateData('test-stack', [])
            provider.resolveWebviewView(mockWebview as any)

            assert.deepStrictEqual(mockWebview.webview.options, { enableScripts: true })
            assert.ok(mockWebview.webview.html.length > 0)
            assert.ok(mockWebview.webview.onDidReceiveMessage.calledOnce)
        })
    })

    describe('HTML generation', function () {
        it('should generate table with correct columns for changes with details', function () {
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Modify',
                        logicalResourceId: 'TestBucket',
                        physicalResourceId: 'test-bucket-123',
                        resourceType: 'AWS::S3::Bucket',
                        replacement: 'False',
                        scope: ['Properties'],
                        details: [
                            {
                                Target: {
                                    Name: 'BucketName',
                                    RequiresRecreation: 'Never',
                                    BeforeValue: 'old-bucket',
                                    AfterValue: 'new-bucket',
                                    AttributeChangeType: 'Modify',
                                },
                                ChangeSource: 'DirectModification',
                                CausingEntity: 'user-change',
                            },
                        ],
                    },
                },
            ]

            const html = setupProviderWithChanges('test-stack', changes)

            // Verify main table headers
            assert.ok(html.includes('Action'))
            assert.ok(html.includes('LogicalResourceId'))
            assert.ok(html.includes('ResourceType'))
            assert.ok(html.includes('Replacement'))

            // Verify main row data
            assert.ok(html.includes('Modify'))
            assert.ok(html.includes('TestBucket'))
            assert.ok(html.includes('test-bucket-123'))
            assert.ok(html.includes('AWS::S3::Bucket'))

            // Verify detail data (in expandable section)
            assert.ok(html.includes('BucketName'))
            assert.ok(html.includes('old-bucket'))
            assert.ok(html.includes('new-bucket'))
            assert.ok(html.includes('DirectModification'))
            assert.ok(html.includes('user-change'))

            // Verify expandable structure
            assert.ok(html.includes('toggleDetails'))
            assert.ok(html.includes('display: none'))
            assert.ok(html.includes('▶'))
        })

        it('should handle multiple detail rows with proper expandable structure', function () {
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Modify',
                        logicalResourceId: 'TestResource',
                        details: [
                            {
                                Target: { Name: 'Property1' },
                                ChangeSource: 'DirectModification',
                            },
                            {
                                Target: { Name: 'Property2' },
                                ChangeSource: 'ParameterReference',
                            },
                        ],
                    },
                },
            ]

            void provider.updateData('test-stack', changes)

            const mockWebview = {
                webview: {
                    options: {},
                    html: '',
                    onDidReceiveMessage: sandbox.stub(),
                },
            }

            provider.resolveWebviewView(mockWebview as any)
            const html = mockWebview.webview.html

            // Should have expandable details with both properties
            assert.ok(html.includes('Property1'))
            assert.ok(html.includes('Property2'))
            assert.ok(html.includes('toggleDetails'))
        })

        it('should handle changes without details', function () {
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Add',
                        logicalResourceId: 'NewResource',
                        resourceType: 'AWS::Lambda::Function',
                    },
                },
            ]

            const html = setupProviderWithChanges('test-stack', changes)

            assert.ok(html.includes('Add'))
            assert.ok(html.includes('NewResource'))
            // Should have empty expand icon cell for resources without details
            assert.ok(html.includes('expand-icon-0'))
        })

        it('should apply correct border colors for different actions', function () {
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Add',
                        logicalResourceId: 'AddedResource',
                    },
                },
                {
                    resourceChange: {
                        action: 'Remove',
                        logicalResourceId: 'RemovedResource',
                    },
                },
                {
                    resourceChange: {
                        action: 'Modify',
                        logicalResourceId: 'ModifiedResource',
                    },
                },
            ]

            const html = setupProviderWithChanges('test-stack', changes)

            assert.ok(html.includes('--vscode-gitDecoration-addedResourceForeground'))
            assert.ok(html.includes('--vscode-gitDecoration-deletedResourceForeground'))
            assert.ok(html.includes('--vscode-gitDecoration-modifiedResourceForeground'))
        })

        it('should show drift status column when drift is detected', function () {
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Modify',
                        logicalResourceId: 'DriftedResource',
                        resourceDriftStatus: 'DELETED',
                    },
                },
            ]

            const html = setupProviderWithChanges('test-stack', changes)

            assert.ok(html.includes('Drift Status'))
            assert.ok(html.includes('⚠️ Deleted'))
        })

        it('should not show drift status column when no drift is detected', function () {
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Modify',
                        logicalResourceId: 'NormalResource',
                    },
                },
            ]

            const html = setupProviderWithChanges('test-stack', changes)

            assert.ok(!html.includes('Drift Status'))
        })

        it('should show drift detail columns when property drift is detected', function () {
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Modify',
                        logicalResourceId: 'DriftedResource',
                        details: [
                            {
                                Target: {
                                    Name: 'BucketName',
                                    AttributeChangeType: 'Modify',
                                    Drift: {
                                        PreviousValue: 'template-value',
                                        ActualValue: 'live-value',
                                    },
                                },
                            },
                        ],
                    },
                },
            ]

            const html = setupProviderWithChanges('test-stack', changes)

            assert.ok(html.includes('Drift: Previous'))
            assert.ok(html.includes('Drift: Actual'))
            assert.ok(html.includes('template-value'))
            assert.ok(html.includes('live-value'))
            assert.ok(html.includes('⚠️ Modified'))
        })
    })
})
