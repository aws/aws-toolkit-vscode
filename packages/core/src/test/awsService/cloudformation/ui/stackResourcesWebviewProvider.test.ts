/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { StackResourcesWebviewProvider } from '../../../../awsService/cloudformation/ui/stackResourcesWebviewProvider'

describe('StackResourcesWebviewProvider', function () {
    let sandbox: sinon.SinonSandbox
    let provider: StackResourcesWebviewProvider
    let mockClient: any
    let mockCoordinator: any

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        mockClient = {
            sendRequest: sandbox.stub(),
        }
        mockCoordinator = {
            onDidChangeStack: sandbox.stub().returns({ dispose: () => {} }),
            setStack: sandbox.stub().resolves(),
            currentStackStatus: undefined,
        } as any
        provider = new StackResourcesWebviewProvider(mockClient, mockCoordinator)
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
            onDidChangeVisibility: sandbox.stub(),
            onDidDispose: sandbox.stub(),
            visible: true,
        }
    }

    function createMockResources(count: number, startIndex = 0) {
        return Array.from({ length: count }, (_, i) => ({
            LogicalResourceId: `Resource${i + startIndex}`,
            PhysicalResourceId: `resource-${i + startIndex}-123`,
            ResourceType: 'AWS::S3::Bucket',
            ResourceStatus: 'CREATE_COMPLETE',
        }))
    }

    async function setupProviderWithResources(stackName: string, resources: any[], nextToken?: string) {
        mockClient.sendRequest.resolves({ resources, nextToken })
        const mockWebview = createMockWebview()
        provider.resolveWebviewView(mockWebview as any)
        await provider.updateData(stackName)
        return mockWebview
    }

    describe('updateData', function () {
        it('should update stack name and fetch resources', async function () {
            const mockResources = createMockResources(1)
            mockClient.sendRequest.resolves({ resources: mockResources })

            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)
            await provider.updateData('test-stack')

            assert.ok(mockClient.sendRequest.calledOnce)
            const [, params] = mockClient.sendRequest.firstCall.args
            assert.strictEqual(params.stackName, 'test-stack')
        })

        it('should handle client request errors gracefully', async function () {
            mockClient.sendRequest.rejects(new Error('Network error'))
            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)

            // Should not throw
            await provider.updateData('test-stack')
        })
    })

    describe('resolveWebviewView', function () {
        it('should configure webview options and set HTML content', function () {
            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)

            assert.deepStrictEqual(mockWebview.webview.options, { enableScripts: true })
            assert.ok(mockWebview.webview.html.length > 0)
        })

        it('should set up visibility change handlers', function () {
            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)

            assert.ok(mockWebview.onDidChangeVisibility.calledOnce)
            assert.ok(mockWebview.onDidDispose.calledOnce)
        })

        it('should set up message handlers for pagination', function () {
            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)

            assert.ok(mockWebview.webview.onDidReceiveMessage.calledOnce)
        })
    })

    describe('HTML generation', function () {
        it('should show no resources message when empty', async function () {
            const mockWebview = await setupProviderWithResources('test-stack', [])
            assert.ok(mockWebview.webview.html.includes('No resources found'))
        })

        it('should generate table with resources', async function () {
            const mockResources = [
                {
                    LogicalResourceId: 'TestBucket',
                    PhysicalResourceId: 'test-bucket-123',
                    ResourceType: 'AWS::S3::Bucket',
                    ResourceStatus: 'CREATE_COMPLETE',
                },
            ]

            const mockWebview = await setupProviderWithResources('test-stack', mockResources)
            const html = mockWebview.webview.html

            // Verify table headers and data
            assert.ok(html.includes('Logical ID'))
            assert.ok(html.includes('Physical ID'))
            assert.ok(html.includes('Type'))
            assert.ok(html.includes('Status'))
            assert.ok(html.includes('TestBucket'))
            assert.ok(html.includes('test-bucket-123'))
            assert.ok(html.includes('AWS::S3::Bucket'))
            assert.ok(html.includes('CREATE_COMPLETE'))
        })

        it('should handle resources without physical ID', async function () {
            const mockResources = [
                {
                    LogicalResourceId: 'TestResource',
                    ResourceType: 'AWS::CloudFormation::WaitConditionHandle',
                    ResourceStatus: 'CREATE_COMPLETE',
                },
            ]

            const mockWebview = await setupProviderWithResources('test-stack', mockResources)
            const html = mockWebview.webview.html

            assert.ok(html.includes('TestResource'))
            assert.ok(html.includes('AWS::CloudFormation::WaitConditionHandle'))
            assert.ok(html.includes('CREATE_COMPLETE'))
        })

        it('should show pagination controls with buttons disabled when there is only one page', async function () {
            const mockWebview = await setupProviderWithResources('test-stack', createMockResources(10))
            const html = mockWebview.webview.html

            // Pagination is always shown, but buttons should be disabled for single page
            assert.ok(html.includes('Previous'))
            assert.ok(html.includes('Next'))
            assert.ok(html.includes('disabled'))
        })

        it('should show pagination controls when there are multiple pages', async function () {
            const mockWebview = await setupProviderWithResources('test-stack', createMockResources(60))
            const html = mockWebview.webview.html

            // Should show pagination buttons for multiple pages
            assert.ok(html.includes('Previous'))
            assert.ok(html.includes('Next'))
        })

        it('should disable Previous button on first page', async function () {
            const mockWebview = await setupProviderWithResources('test-stack', createMockResources(60))
            const html = mockWebview.webview.html

            // Previous button should be disabled on first page
            assert.ok(html.includes('disabled'))
            assert.ok(html.includes('Previous'))
        })
    })

    describe('pagination functionality', function () {
        let clock: sinon.SinonFakeTimers

        beforeEach(function () {
            clock = sandbox.useFakeTimers()
        })

        afterEach(function () {
            clock.restore()
        })

        async function testPaginationMessage(command: string) {
            const mockWebview = await setupProviderWithResources('test-stack', createMockResources(60))
            const messageHandler = mockWebview.webview.onDidReceiveMessage.firstCall.args[0]
            await messageHandler({ command })
            assert.ok(mockWebview.webview.html.length > 0)
        }

        it('should handle nextPage message', async function () {
            await testPaginationMessage('nextPage')
        })

        it('should handle prevPage message', async function () {
            await testPaginationMessage('prevPage')
        })

        it('should start auto-update when webview becomes visible', async function () {
            mockCoordinator.currentStackStatus = 'UPDATE_IN_PROGRESS'
            const mockWebview = await setupProviderWithResources('test-stack', [])
            const visibilityHandler = mockWebview.onDidChangeVisibility.firstCall.args[0]
            mockWebview.visible = true
            visibilityHandler()

            const initialCallCount = mockClient.sendRequest.callCount
            clock.tick(5000)

            assert.ok(mockClient.sendRequest.callCount >= initialCallCount + 1)
        })

        it('should stop auto-update when webview becomes hidden', async function () {
            const mockWebview = await setupProviderWithResources('test-stack', [])
            const visibilityHandler = mockWebview.onDidChangeVisibility.firstCall.args[0]

            // Start then stop auto-update
            mockWebview.visible = true
            visibilityHandler()
            mockWebview.visible = false
            visibilityHandler()

            const callCountAfterStop = mockClient.sendRequest.callCount
            clock.tick(10000)
            assert.strictEqual(mockClient.sendRequest.callCount, callCountAfterStop)
        })
    })

    describe('loadResources', function () {
        it('should handle nextToken for pagination', async function () {
            const firstBatch = createMockResources(50)
            const secondBatch = createMockResources(10, 50)

            mockClient.sendRequest
                .onFirstCall()
                .resolves({ resources: firstBatch, nextToken: 'token123' })
                .onSecondCall()
                .resolves({ resources: secondBatch })

            const mockWebview = createMockWebview()
            provider.resolveWebviewView(mockWebview as any)
            await provider.updateData('test-stack')

            // Simulate nextPage to load more resources
            const messageHandler = mockWebview.webview.onDidReceiveMessage.firstCall.args[0]
            await messageHandler({ command: 'nextPage' })

            assert.strictEqual(mockClient.sendRequest.callCount, 2)
        })

        it('should return early if no client or stack name', async function () {
            const mockCoordinator = {
                onDidChangeStack: sandbox.stub().returns({ dispose: () => {} }),
            } as any
            const providerWithoutClient = new StackResourcesWebviewProvider(undefined as any, mockCoordinator)
            const mockWebview = createMockWebview()
            providerWithoutClient.resolveWebviewView(mockWebview as any)

            // Should not throw
            await providerWithoutClient.updateData('')
        })
    })
})
