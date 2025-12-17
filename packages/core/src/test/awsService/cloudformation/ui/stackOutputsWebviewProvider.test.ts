/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { StackOutputsWebviewProvider } from '../../../../awsService/cloudformation/ui/stackOutputsWebviewProvider'

describe('StackOutputsWebviewProvider', () => {
    let sandbox: sinon.SinonSandbox
    let provider: StackOutputsWebviewProvider
    let mockClient: any
    let mockCoordinator: any

    function createMockView() {
        return {
            webview: {
                options: {},
                html: '',
            },
            onDidChangeVisibility: sandbox.stub(),
            visible: true,
        }
    }

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        mockClient = {
            sendRequest: sandbox.stub().resolves({
                stack: {
                    StackName: 'test-stack',
                    StackStatus: 'CREATE_COMPLETE',
                    Outputs: [
                        {
                            OutputKey: 'BucketName',
                            OutputValue: 'my-bucket',
                            Description: 'S3 bucket name',
                        },
                    ],
                },
            }),
        }
        mockCoordinator = {
            onDidChangeStack: sandbox.stub().returns({ dispose: () => {} }),
            setStack: sandbox.stub().resolves(),
            currentStackStatus: undefined,
        }
        provider = new StackOutputsWebviewProvider(mockClient, mockCoordinator)
    })

    afterEach(() => {
        provider.dispose()
        sandbox.restore()
    })

    it('should use DescribeStackRequest to load outputs', async () => {
        await provider.resolveWebviewView(createMockView() as any)
        await provider.showOutputs('test-stack')

        assert.strictEqual(mockClient.sendRequest.calledOnce, true)
        const requestArgs = mockClient.sendRequest.firstCall.args
        assert.strictEqual(requestArgs[1].stackName, 'test-stack')
    })

    it('should extract outputs from stack object', async () => {
        const mockView = createMockView()
        await provider.resolveWebviewView(mockView as any)

        await provider.showOutputs('test-stack')

        assert.strictEqual(mockView.webview.html.includes('BucketName'), true)
        assert.strictEqual(mockView.webview.html.includes('my-bucket'), true)
    })

    it('should update coordinator with stack status', async () => {
        await provider.resolveWebviewView(createMockView() as any)
        await provider.showOutputs('test-stack')

        assert.strictEqual(mockCoordinator.setStack.calledWith('test-stack', 'CREATE_COMPLETE'), true)
    })

    it('should not update coordinator if status unchanged', async () => {
        mockCoordinator.currentStackStatus = 'CREATE_COMPLETE'

        await provider.resolveWebviewView(createMockView() as any)
        await provider.showOutputs('test-stack')

        assert.strictEqual(mockCoordinator.setStack.called, false)
    })

    it('should include console link with ARN when stackArn is set', async () => {
        const mockView = createMockView()
        await provider.resolveWebviewView(mockView as any)

        const coordinatorCallback = mockCoordinator.onDidChangeStack.firstCall.args[0]
        await coordinatorCallback({
            stackName: 'test-stack',
            stackArn: 'arn:aws:cloudformation:eu-west-1:123456789012:stack/test-stack/def-789',
            isChangeSetMode: false,
        })

        const html = mockView.webview.html
        assert.ok(html.includes('href="https://eu-west-1.console.aws.amazon.com'))
        assert.ok(html.includes('/stacks/outputs?stackId='))
        assert.ok(html.includes('View in AWS Console'))
    })

    it('should not include console link when stackArn is missing', async () => {
        const mockView = createMockView()
        await provider.resolveWebviewView(mockView as any)

        const coordinatorCallback = mockCoordinator.onDidChangeStack.firstCall.args[0]
        await coordinatorCallback({
            stackName: 'test-stack',
            stackArn: undefined,
            isChangeSetMode: false,
        })

        const html = mockView.webview.html
        assert.ok(!html.includes('href="https://'))
    })
})
