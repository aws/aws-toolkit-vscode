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
})
