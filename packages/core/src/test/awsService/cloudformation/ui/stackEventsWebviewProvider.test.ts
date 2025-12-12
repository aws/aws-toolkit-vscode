/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { StackEventsWebviewProvider } from '../../../../awsService/cloudformation/ui/stackEventsWebviewProvider'

describe('StackEventsWebviewProvider', () => {
    let sandbox: sinon.SinonSandbox
    let provider: StackEventsWebviewProvider
    let mockClient: any
    let coordinatorCallback: any

    function createMockView() {
        return {
            webview: {
                onDidReceiveMessage: sandbox.stub(),
                html: '',
                options: {},
            },
            onDidChangeVisibility: sandbox.stub(),
            visible: true,
            onDidDispose: sandbox.stub(),
        }
    }

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        mockClient = {
            sendRequest: sandbox.stub().resolves({
                events: [
                    {
                        EventId: 'event-1',
                        StackName: 'test-stack',
                        Timestamp: new Date(),
                        ResourceStatus: 'CREATE_IN_PROGRESS',
                    },
                ],
                nextToken: undefined,
            }),
        }
        const mockCoordinator: any = {
            onDidChangeStack: sandbox.stub().callsFake((callback: any) => {
                coordinatorCallback = callback
                return { dispose: () => {} }
            }),
        }
        provider = new StackEventsWebviewProvider(mockClient, mockCoordinator)
    })

    afterEach(() => {
        provider.dispose()
        sandbox.restore()
    })

    it('should load stack events', async () => {
        await provider.showStackEvents('test-stack')

        assert.strictEqual(mockClient.sendRequest.calledOnce, true)
    })

    it('should group events by operation ID', async () => {
        mockClient.sendRequest.resolves({
            events: [
                {
                    EventId: 'event-1',
                    StackName: 'test-stack',
                    Timestamp: new Date(),
                    ResourceStatus: 'CREATE_COMPLETE',
                    OperationId: 'op-123',
                },
                {
                    EventId: 'event-2',
                    StackName: 'test-stack',
                    Timestamp: new Date(),
                    ResourceStatus: 'CREATE_IN_PROGRESS',
                    OperationId: 'op-123',
                },
                {
                    EventId: 'event-3',
                    StackName: 'test-stack',
                    Timestamp: new Date(),
                    ResourceStatus: 'UPDATE_COMPLETE',
                },
            ],
            nextToken: undefined,
        })

        const view = createMockView()
        provider.resolveWebviewView(view as any)
        await provider.showStackEvents('test-stack')

        const html = view.webview.html
        assert.ok(html.includes('op-123'))
        assert.ok(html.includes('parent-row'))
        assert.ok(html.includes('child-row'))
    })

    it('should expand first operation group by default', async () => {
        mockClient.sendRequest.resolves({
            events: [
                {
                    EventId: 'event-1',
                    StackName: 'test-stack',
                    Timestamp: new Date(),
                    ResourceStatus: 'CREATE_COMPLETE',
                    OperationId: 'op-123',
                },
            ],
            nextToken: undefined,
        })

        const view = createMockView()
        provider.resolveWebviewView(view as any)
        await provider.showStackEvents('test-stack')

        const html = view.webview.html
        assert.ok(html.includes('expanded'))
    })

    it('should stop auto-refresh on terminal state', async () => {
        const clock = sandbox.useFakeTimers()

        await provider.showStackEvents('test-stack')

        // Simulate terminal state notification
        await coordinatorCallback({
            stackName: 'test-stack',
            isChangeSetMode: false,
            stackStatus: 'CREATE_COMPLETE',
        })

        clock.tick(10000)

        // Should not continue refreshing after terminal state
        const callCount = mockClient.sendRequest.callCount
        clock.tick(5000)
        assert.strictEqual(mockClient.sendRequest.callCount, callCount)

        clock.restore()
    })

    it('should continue auto-refresh during in-progress state', async () => {
        const clock = sandbox.useFakeTimers()

        await provider.showStackEvents('test-stack')

        await coordinatorCallback({
            stackName: 'test-stack',
            isChangeSetMode: false,
            stackStatus: 'UPDATE_IN_PROGRESS',
        })

        const initialCalls = mockClient.sendRequest.callCount
        clock.tick(5000)

        assert.strictEqual(mockClient.sendRequest.callCount > initialCalls, true)

        clock.restore()
    })

    it('should include console link with ARN when stackArn is set', async () => {
        const view = createMockView()
        provider.resolveWebviewView(view as any)

        await coordinatorCallback({
            stackName: 'test-stack',
            stackArn: 'arn:aws:cloudformation:us-west-2:123456789012:stack/test-stack/xyz-456',
            isChangeSetMode: false,
        })

        const html = view.webview.html
        assert.ok(html.includes('href="https://us-west-2.console.aws.amazon.com'))
        assert.ok(html.includes('/stacks/events?stackId='))
        assert.ok(html.includes('View in AWS Console'))
    })

    it('should not include console link when stackArn is missing', async () => {
        const view = createMockView()
        provider.resolveWebviewView(view as any)

        await coordinatorCallback({
            stackName: 'test-stack',
            stackArn: undefined,
            isChangeSetMode: false,
        })

        const html = view.webview.html
        assert.ok(!html.includes('href="https://'))
    })

    it('should show "X events loaded" in header when nextToken is available', async () => {
        mockClient.sendRequest.resolves({
            events: Array.from({ length: 50 }, (_, i) => ({
                EventId: `event-${i}`,
                StackName: 'test-stack',
                Timestamp: new Date(),
                ResourceStatus: 'CREATE_IN_PROGRESS',
            })),
            nextToken: 'token123',
        })

        const view = createMockView()
        provider.resolveWebviewView(view as any)
        await provider.showStackEvents('test-stack')

        const html = view.webview.html
        assert.ok(html.includes('(50 events loaded)'))
    })

    it('should show "X events" in header when nextToken is not available', async () => {
        mockClient.sendRequest.resolves({
            events: Array.from({ length: 50 }, (_, i) => ({
                EventId: `event-${i}`,
                StackName: 'test-stack',
                Timestamp: new Date(),
                ResourceStatus: 'CREATE_IN_PROGRESS',
            })),
            nextToken: undefined,
        })

        const view = createMockView()
        provider.resolveWebviewView(view as any)
        await provider.showStackEvents('test-stack')

        const html = view.webview.html
        assert.ok(html.includes('(50 events)'))
        assert.ok(!html.includes('(50 events loaded)'))
    })
})
