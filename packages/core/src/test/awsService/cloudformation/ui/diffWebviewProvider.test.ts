/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { DiffWebviewProvider } from '../../../../awsService/cloudformation/ui/diffWebviewProvider'
import {
    DeploymentMode,
    StackChange,
} from '../../../../awsService/cloudformation/stacks/actions/stackActionRequestType'

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
            assert.ok(html.includes('<svg'))
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

        it('should show drift status column when deploymentMode is REVERT_DRIFT', function () {
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Modify',
                        logicalResourceId: 'Resource',
                    },
                },
            ]

            void provider.updateData('test-stack', changes, undefined, false, undefined, DeploymentMode.REVERT_DRIFT)
            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)
            const html = mockWebview.webview.html

            assert.ok(html.includes('Drift Status'))
        })
    })

    describe('deployment button conditional rendering', function () {
        it('should show deploy button when changeset is CREATE_COMPLETE and deployments enabled', function () {
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Add',
                        logicalResourceId: 'TestResource',
                    },
                },
            ]

            void provider.updateData(
                'test-stack',
                changes,
                'test-changeset',
                true,
                undefined,
                undefined,
                'CREATE_COMPLETE'
            )
            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)

            assert.ok(mockWebview.webview.html.includes('Deploy Changes'))
            assert.ok(mockWebview.webview.html.includes('Delete Changeset'))
        })

        it('should not show deploy button when changeset is not CREATE_COMPLETE', function () {
            // changes are not available if a changeset is not created
            const changes: StackChange[] = []

            void provider.updateData(
                'test-stack',
                changes,
                'test-changeset',
                true,
                undefined,
                undefined,
                'CREATE_IN_PROGRESS'
            )
            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)

            assert.ok(!mockWebview.webview.html.includes('Deploy Changes'))
            assert.ok(mockWebview.webview.html.includes('Delete Changeset'))
        })

        it('should not show deployment buttons when deployments not enabled', function () {
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Add',
                        logicalResourceId: 'TestResource',
                    },
                },
            ]

            void provider.updateData(
                'test-stack',
                changes,
                'test-changeset',
                false,
                undefined,
                undefined,
                'CREATE_COMPLETE'
            )
            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)

            assert.ok(!mockWebview.webview.html.includes('Deploy Changes'))
            assert.ok(!mockWebview.webview.html.includes('deployment-actions'))
        })

        it('should not show deployment buttons when no changeset name', function () {
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Add',
                        logicalResourceId: 'TestResource',
                    },
                },
            ]

            void provider.updateData('test-stack', changes, undefined, true, undefined, undefined, 'CREATE_COMPLETE')
            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)

            assert.ok(!mockWebview.webview.html.includes('Deploy Changes'))
            assert.ok(!mockWebview.webview.html.includes('deployment-actions'))
        })

        it('should not show deployment buttons when changeset status is DELETE_PENDING', function () {
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Add',
                        logicalResourceId: 'TestResource',
                    },
                },
            ]

            void provider.updateData(
                'test-stack',
                changes,
                'test-changeset',
                true,
                undefined,
                undefined,
                'DELETE_PENDING'
            )
            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)

            assert.ok(!mockWebview.webview.html.includes('Deploy Changes'))
            assert.ok(!mockWebview.webview.html.includes('Delete Changeset'))
            assert.ok(!mockWebview.webview.html.includes('deployment-actions'))
        })

        it('should not show deployment buttons when changeset status is CREATE_PENDING', function () {
            const changes: StackChange[] = []

            void provider.updateData(
                'test-stack',
                changes,
                'test-changeset',
                true,
                undefined,
                undefined,
                'CREATE_PENDING'
            )
            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)

            assert.ok(!mockWebview.webview.html.includes('Deploy Changes'))
            assert.ok(!mockWebview.webview.html.includes('Delete Changeset'))
            assert.ok(!mockWebview.webview.html.includes('deployment-actions'))
        })
    })

    describe('pagination', function () {
        it('should show pagination controls when changes exceed page size', function () {
            // Create 60 changes (exceeds default pageSize of 50)
            const changes: StackChange[] = Array.from({ length: 60 }, (_, i) => ({
                resourceChange: {
                    action: 'Add',
                    logicalResourceId: `Resource${i}`,
                    resourceType: 'AWS::S3::Bucket',
                },
            }))

            const html = setupProviderWithChanges('test-stack', changes)

            assert.ok(html.includes('Page 1 of 2'))
            assert.ok(html.includes('nextPage()'))
            assert.ok(html.includes('prevPage()'))
            assert.ok(html.includes('pagination-controls'))
        })

        it('should not show pagination for small change sets', function () {
            const changes: StackChange[] = [
                {
                    resourceChange: {
                        action: 'Add',
                        logicalResourceId: 'SingleResource',
                        resourceType: 'AWS::S3::Bucket',
                    },
                },
            ]

            const html = setupProviderWithChanges('test-stack', changes)

            assert.ok(!html.includes('pagination-controls'))
            assert.ok(!html.includes('Page 1 of'))
        })

        it('should display correct page numbers and navigation state', function () {
            const changes: StackChange[] = Array.from({ length: 150 }, (_, i) => ({
                resourceChange: {
                    action: 'Add',
                    logicalResourceId: `Resource${i}`,
                },
            }))

            const html = setupProviderWithChanges('test-stack', changes)

            assert.ok(html.includes('Page 1 of 3'))
            // Previous button should be disabled on first page
            assert.ok(html.includes('opacity: 0.5'))
            assert.ok(html.includes('cursor: not-allowed'))
        })
    })

    describe('empty changes handling', function () {
        it('should show no changes message when changes is undefined', function () {
            void provider.updateData('test-stack', undefined as any, 'test-changeset')
            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)

            assert.ok(mockWebview.webview.html.includes('No changes detected'))
            assert.ok(mockWebview.webview.html.includes('test-stack'))
            assert.ok(mockWebview.webview.html.includes('Delete Changeset'))
        })

        it('should show no changes message when changes array is empty', function () {
            void provider.updateData('empty-stack', [], 'test-changeset')
            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)
            const html = mockWebview.webview.html

            assert.ok(html.includes('No changes detected'))
            assert.ok(html.includes('empty-stack'))
            assert.ok(html.includes('Delete Changeset'))
        })

        it('should not show delete button when no changeset name', function () {
            const html = setupProviderWithChanges('empty-stack', [])

            assert.ok(html.includes('No changes detected'))
            assert.ok(!html.includes('Delete Changeset'))
        })

        it('should not show table when no changes', function () {
            const html = setupProviderWithChanges('empty-stack', [])

            assert.ok(!html.includes('<table'))
            assert.ok(!html.includes('Action'))
            assert.ok(!html.includes('LogicalResourceId'))
        })
    })
})
