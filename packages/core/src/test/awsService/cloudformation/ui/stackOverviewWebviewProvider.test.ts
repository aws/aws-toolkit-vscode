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

    it('should include console link with ARN in HTML', async () => {
        const view = createMockView()
        provider.resolveWebviewView(view as any)
        await provider.showStackOverview('test-stack')

        const html = view.webview.html
        assert.ok(html.includes('href="https://console.aws.amazon.com/go/view?arn='))
        assert.ok(html.includes('stack-id-123'))
        assert.ok(html.includes('View in AWS Console'))
    })

    it('should not include console link when ARN is missing', async () => {
        mockClient.sendRequest.resolves({
            stack: {
                StackName: 'test-stack',
                StackStatus: 'CREATE_COMPLETE',
                StackId: undefined,
            },
        })

        const view = createMockView()
        provider.resolveWebviewView(view as any)
        await provider.showStackOverview('test-stack')

        const html = view.webview.html
        assert.ok(!html.includes('href="https://'))
    })

    it('should HTML-encode malicious Description and StackStatusReason to prevent XSS', async () => {
        mockClient.sendRequest.resolves({
            stack: {
                StackName: '<img src=x onerror="alert(1)">',
                StackStatus: 'CREATE_COMPLETE',
                StackId: 'stack-id-123',
                Description: '<script>alert(2)</script>',
                StackStatusReason: '<svg onload="alert(3)">',
            },
        })

        const view = createMockView()
        provider.resolveWebviewView(view as any)
        await provider.showStackOverview('test-stack')

        const html = view.webview.html
        assert.ok(!html.includes('<script>alert(2)</script>'), 'raw <script> Description must not be present')
        assert.ok(!html.includes('<svg onload="alert(3)">'), 'raw StackStatusReason payload must not be present')
        assert.ok(!html.includes('<img src=x onerror="alert(1)">'), 'raw StackName payload must not be present')
        assert.ok(html.includes('&lt;script&gt;alert(2)&lt;/script&gt;'), 'Description should be entity-encoded')
        assert.ok(
            html.includes('&lt;svg onload=&quot;alert(3)&quot;&gt;'),
            'StackStatusReason should be entity-encoded'
        )
    })

    it('should HTML-encode error messages', async () => {
        mockClient.sendRequest.rejects(new Error('<svg onload="alert(1)">'))

        const view = createMockView()
        provider.resolveWebviewView(view as any)
        await provider.showStackOverview('test-stack')

        const html = view.webview.html
        assert.ok(!html.includes('<svg onload="alert(1)">'), 'raw error payload must not be present')
        assert.ok(html.includes('&lt;svg onload=&quot;alert(1)&quot;&gt;'), 'error message should be entity-encoded')
    })

    it('should set a restrictive Content-Security-Policy on the overview webview', async () => {
        const view = createMockView()
        provider.resolveWebviewView(view as any)
        await provider.showStackOverview('test-stack')

        const html = view.webview.html
        assert.ok(html.includes('Content-Security-Policy'), 'CSP meta tag should be present')
        assert.ok(html.includes("default-src 'none'"), "CSP should default-src 'none' to block scripts")
    })
})
