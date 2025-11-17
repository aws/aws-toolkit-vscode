/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { StackOverviewWebviewProvider } from '../../../../awsService/cloudformation/ui/stackOverviewWebviewProvider'

describe('StackOverviewWebviewProvider', () => {
    let sandbox: sinon.SinonSandbox
    let provider: StackOverviewWebviewProvider
    let mockClient: any
    let mockCoordinator: any
    let coordinatorCallback: any

    function createMockView() {
        return {
            webview: {
                options: {},
                html: '',
            },
            onDidChangeVisibility: sandbox.stub(),
            onDidDispose: sandbox.stub(),
        }
    }

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        mockClient = {
            sendRequest: sandbox.stub().resolves({
                stack: {
                    StackName: 'test-stack',
                    StackStatus: 'CREATE_COMPLETE',
                    StackId: 'stack-id-123',
                    CreationTime: new Date(),
                },
            }),
        }
        mockCoordinator = {
            onDidChangeStack: sandbox.stub().callsFake((callback: any) => {
                coordinatorCallback = callback
                return { dispose: () => {} }
            }),
            setStack: sandbox.stub().resolves(),
            currentStackStatus: undefined,
        }
        provider = new StackOverviewWebviewProvider(mockClient, mockCoordinator)
    })

    afterEach(() => {
        provider.dispose()
        sandbox.restore()
    })

    it('should load stack overview', async () => {
        provider.resolveWebviewView(createMockView() as any)
        await provider.showStackOverview('test-stack')

        assert.strictEqual(mockClient.sendRequest.calledOnce, true)
        assert.strictEqual(mockCoordinator.setStack.calledOnce, true)
    })

    it('should update coordinator with stack status', async () => {
        provider.resolveWebviewView(createMockView() as any)
        await provider.showStackOverview('test-stack')

        assert.strictEqual(mockCoordinator.setStack.calledWith('test-stack', 'CREATE_COMPLETE'), true)
    })

    it('should not update coordinator if status unchanged', async () => {
        mockCoordinator.currentStackStatus = 'CREATE_COMPLETE'

        provider.resolveWebviewView(createMockView() as any)
        await provider.showStackOverview('test-stack')

        assert.strictEqual(mockCoordinator.setStack.called, false)
    })

    it('should start auto-refresh on stack change', async () => {
        const clock = sandbox.useFakeTimers()

        await coordinatorCallback({
            stackName: 'test-stack',
            isChangeSetMode: false,
            stackStatus: 'CREATE_IN_PROGRESS',
        })

        clock.tick(5000)

        assert.strictEqual(mockClient.sendRequest.callCount >= 2, true)

        clock.restore()
    })

    it('should stop auto-refresh on terminal state', async () => {
        const clock = sandbox.useFakeTimers()

        await coordinatorCallback({
            stackName: 'test-stack',
            isChangeSetMode: false,
            stackStatus: 'CREATE_COMPLETE',
        })

        clock.tick(10000)

        // Should only be called once (initial load), not refreshed
        assert.strictEqual(mockClient.sendRequest.callCount, 1)

        clock.restore()
    })
})
