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

    it('should HTML-encode malicious output values to prevent XSS (GHSA-8hmf-jv79-54f4)', async () => {
        const payload = '<svg onload="alert(1)">'
        mockClient.sendRequest.resolves({
            stack: {
                StackName: 'test-stack',
                StackStatus: 'CREATE_COMPLETE',
                Outputs: [
                    {
                        OutputKey: '<img src=x onerror="alert(2)">',
                        OutputValue: payload,
                        Description: '<script>alert(3)</script>',
                        ExportName: '"><b>bold</b>',
                    },
                ],
            },
        })

        const mockView = createMockView()
        await provider.resolveWebviewView(mockView as any)
        await provider.showOutputs('test-stack')

        const html = mockView.webview.html
        // The raw payloads must never appear as live markup.
        assert.ok(!html.includes(payload), 'raw <svg onload> payload must not be present')
        assert.ok(!html.includes('<script>alert(3)</script>'), 'raw <script> payload must not be present')
        assert.ok(!html.includes('onerror="alert(2)"'), 'raw onerror attribute must not be present')
        // The values must be present in encoded form instead.
        assert.ok(html.includes('&lt;svg onload=&quot;alert(1)&quot;&gt;'), 'OutputValue should be entity-encoded')
        assert.ok(html.includes('&lt;script&gt;alert(3)&lt;/script&gt;'), 'Description should be entity-encoded')
    })

    it('should HTML-encode a malicious stack name (GHSA-8hmf-jv79-54f4)', async () => {
        const mockView = createMockView()
        await provider.resolveWebviewView(mockView as any)

        const coordinatorCallback = mockCoordinator.onDidChangeStack.firstCall.args[0]
        await coordinatorCallback({
            stackName: '<img src=x onerror="alert(1)">',
            stackArn: undefined,
            isChangeSetMode: false,
        })

        const html = mockView.webview.html
        assert.ok(!html.includes('<img src=x onerror="alert(1)">'), 'raw stackName payload must not be present')
        assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'), 'stackName should be entity-encoded')
    })

    it('should HTML-encode error messages (GHSA-8hmf-jv79-54f4)', async () => {
        mockClient.sendRequest.rejects(new Error('<svg onload="alert(1)">'))

        const mockView = createMockView()
        await provider.resolveWebviewView(mockView as any)
        await provider.showOutputs('test-stack')

        const html = mockView.webview.html
        assert.ok(!html.includes('<svg onload="alert(1)">'), 'raw error payload must not be present')
        assert.ok(html.includes('&lt;svg onload=&quot;alert(1)&quot;&gt;'), 'error message should be entity-encoded')
    })

    it('should set a restrictive Content-Security-Policy on the outputs webview', async () => {
        const mockView = createMockView()
        await provider.resolveWebviewView(mockView as any)
        await provider.showOutputs('test-stack')

        const html = mockView.webview.html
        assert.ok(html.includes('Content-Security-Policy'), 'CSP meta tag should be present')
        assert.ok(html.includes("default-src 'none'"), "CSP should default-src 'none' to block scripts")
    })
})
