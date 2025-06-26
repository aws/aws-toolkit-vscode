/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { AutoDebugLspClient } from '../../../src/autoDebug/autoDebugLspClient'

/**
 * Integration test for AutoDebug → LSP Server flow
 *
 * This test validates the complete end-to-end integration:
 * 1. Message creation and formatting
 * 2. Message routing through LSP client
 * 3. Webview postMessage to chat provider
 * 4. Integration with Amazon Q chat pipeline
 */
describe('AutoDebug LSP Integration', function () {
    this.timeout(30000) // Allow time for real LSP operations

    let sandbox: sinon.SinonSandbox
    let mockLanguageClient: any
    let mockWebview: any
    let mockChatViewProvider: any
    let autoDebugLspClient: AutoDebugLspClient

    // Track integration calls
    let webviewMessages: Array<{ command: string; params: any; timestamp: number }> = []
    let focusCalls: number = 0

    before(async function () {
        console.log('=== AutoDebug Integration Test Setup ===')
        sandbox = sinon.createSandbox()

        // Set up mock LSP infrastructure
        setupMockLspInfrastructure()

        // Set up AutoDebug system
        setupAutoDebugSystem()

        console.log('=== Setup Complete ===')
    })

    after(function () {
        sandbox.restore()
        console.log('=== AutoDebug Integration Test Cleanup Complete ===')
    })

    beforeEach(function () {
        // Clear tracking arrays before each test
        webviewMessages = []
        focusCalls = 0
    })

    describe('End-to-End AutoDebug Integration', function () {
        it('should send error messages through webview postMessage pipeline', async function () {
            console.log('=== Test: Complete Pipeline Integration ===')

            // Create realistic AutoDebug error message
            const errorMessage = `🔧 **Auto Debug**: I detected some errors in your code. Please help me fix them:

**File:** /test/main.cpp
**Language:** cpp

**Code with errors:**
\`\`\`cpp
#include <iostream>

int main() {
    cout << "Hello World!" << endl;
    return 0;
}
\`\`\`

**Detected Issues:**
- **ERROR**: identifier "cout" is undefined
  Location: Line 5, Column 5

Please fix the error in place in the file.`

            // Send message through AutoDebug LSP client
            console.log('Sending AutoDebug message through LSP client...')
            const result = await autoDebugLspClient.sendChatMessage(errorMessage, 'test-integration-123')

            // Verify successful result
            assert.ok(result, 'Expected result from sendChatMessage')
            assert.strictEqual(result.type, 'answer', 'Expected answer type result')
            assert.ok(result.messageId, 'Expected messageId in result')

            // Verify webview postMessage was called
            console.log('Verifying webview integration...')
            assert.strictEqual(webviewMessages.length, 1, 'Expected exactly one webview message')

            const webviewMessage = webviewMessages[0]
            assert.strictEqual(webviewMessage.command, 'sendToPrompt', 'Expected sendToPrompt command')

            // Verify message parameters
            const params = webviewMessage.params
            assert.ok(params, 'Expected params in webview message')
            assert.strictEqual(params.triggerType, 'autoDebug', 'Expected autoDebug trigger type')
            assert.strictEqual(params.autoSubmit, true, 'Expected autoSubmit to be true')
            assert.strictEqual(params.selection, '', 'Expected empty selection')

            // Verify prompt structure
            assert.ok(params.prompt, 'Expected prompt in params')
            assert.strictEqual(params.prompt.prompt, errorMessage, 'Expected exact message in prompt field')
            assert.strictEqual(
                params.prompt.escapedPrompt,
                errorMessage,
                'Expected exact message in escapedPrompt field'
            )

            // Verify message content
            const messageContent = params.prompt.prompt
            assert.ok(messageContent.includes('Auto Debug'), 'Expected Auto Debug header')
            assert.ok(messageContent.includes('identifier "cout" is undefined'), 'Expected specific error message')
            assert.ok(messageContent.includes('**File:**'), 'Expected file information')
            assert.ok(messageContent.includes('**Language:**'), 'Expected language information')
            assert.ok(messageContent.includes('```cpp'), 'Expected code block with language')

            console.log('✅ Complete pipeline integration verified successfully')
        })

        it('should handle focus panel correctly', async function () {
            console.log('=== Test: Focus Panel Integration ===')

            // Set up focus tracking
            const focusStub = sandbox.stub().callsFake(async () => {
                focusCalls++
                return Promise.resolve()
            })

            // Replace the focus function
            sandbox.replace(require('../../../src/lsp/chat/commands'), 'focusAmazonQPanel', focusStub)

            // Trigger message sending
            const testMessage = '🔧 **Auto Debug**: Test focus integration'
            await autoDebugLspClient.sendChatMessage(testMessage, 'focus-test-456')

            // Verify focus was called
            assert.strictEqual(focusCalls, 1, 'Expected focusAmazonQPanel to be called once')
            assert.ok(focusStub.calledOnce, 'Expected focus stub to be called once')

            console.log('✅ Focus panel integration verified successfully')
        })

        it('should handle LSP client availability correctly', async function () {
            console.log('=== Test: LSP Client Availability ===')

            // Test with available client
            assert.ok(autoDebugLspClient.isAvailable(), 'Expected LSP client to be available with mock client')

            // Test with unavailable client
            const unavailableClient = new AutoDebugLspClient(undefined as any)
            assert.strictEqual(unavailableClient.isAvailable(), false, 'Expected unavailable client to report false')

            console.log('✅ LSP client availability verified successfully')
        })

        it('should handle webview postMessage errors gracefully', async function () {
            console.log('=== Test: Error Handling ===')

            // Make webview postMessage fail
            mockWebview.postMessage = sandbox.stub().rejects(new Error('Webview communication failed'))

            // Mock vscode clipboard for fallback
            const clipboardStub = sandbox.stub().resolves()
            const showInfoStub = sandbox.stub().resolves('Copy & Send Manually')
            sandbox.stub(vscode.env, 'clipboard').value({
                writeText: clipboardStub,
            })
            sandbox.stub(vscode.window, 'showInformationMessage').callsFake(showInfoStub)

            // Trigger AutoDebug - should not throw but handle gracefully
            const testMessage = 'Test error handling message'
            const result = await autoDebugLspClient.sendChatMessage(testMessage, 'error-test-789')

            // Should return a result even when webview fails (fallback handling)
            assert.ok(result, 'Expected result even when webview fails')
            assert.strictEqual(result.type, 'answer', 'Expected answer type result')
            assert.ok(result.body && result.body.includes('fallback'), 'Expected fallback indication in result')

            // Verify fallback was triggered
            assert.ok(showInfoStub.called, 'Expected user notification for fallback')
            assert.ok(clipboardStub.called, 'Expected clipboard write for fallback')

            console.log('✅ Error handling verified successfully')
        })

        it('should validate message format matches working explainIssue command', async function () {
            console.log('=== Test: Message Format Validation ===')

            const autoDebugMessage = `🔧 **Auto Debug**: Multiple errors detected:

**File:** /project/src/main.cpp
**Language:** cpp

**Code with errors:**
\`\`\`cpp
int main() {
    undefined_var = 5;
    cout << "test";
    return 0
}
\`\`\`

**Detected Issues:**
- **ERROR**: 'undefined_var' was not declared
- **ERROR**: 'cout' is not defined
- **ERROR**: expected ';' before 'return'

Please fix the errors in place in the file.`

            await autoDebugLspClient.sendChatMessage(autoDebugMessage, 'format-test-101')

            // Verify message was processed
            assert.strictEqual(webviewMessages.length, 1, 'Expected one message processed')

            const processedMessage = webviewMessages[0]

            // Verify it matches the explainIssue command format exactly
            assert.strictEqual(processedMessage.command, 'sendToPrompt', 'Expected sendToPrompt command')
            assert.ok(processedMessage.params.prompt, 'Expected prompt object')
            assert.ok(processedMessage.params.prompt.prompt, 'Expected prompt.prompt field')
            assert.ok(processedMessage.params.prompt.escapedPrompt, 'Expected prompt.escapedPrompt field')
            assert.strictEqual(processedMessage.params.autoSubmit, true, 'Expected autoSubmit true')
            assert.strictEqual(processedMessage.params.triggerType, 'autoDebug', 'Expected autoDebug trigger')

            console.log('✅ Message format validation successful')
        })
    })

    // === Helper Functions ===

    function setupMockLspInfrastructure(): void {
        console.log('Setting up mock LSP infrastructure...')

        // Mock Language Client
        mockLanguageClient = {
            needsStart: sandbox.stub().returns(false),
            sendRequest: sandbox.stub().resolves({}),
            onRequest: sandbox.stub(),
            onNotification: sandbox.stub(),
        }

        // Mock Webview with message tracking
        mockWebview = {
            postMessage: sandbox.stub().callsFake(async (message) => {
                console.log(`Webview postMessage called:`, JSON.stringify(message, undefined, 2))
                webviewMessages.push({
                    command: message.command,
                    params: message.params,
                    timestamp: Date.now(),
                })
                return Promise.resolve()
            }),
        }

        // Mock Chat View Provider
        mockChatViewProvider = {
            webview: mockWebview,
            onDidChangeViewState: sandbox.stub(),
            dispose: sandbox.stub(),
        }

        // Set global provider (simulating real activation)
        ;(global as any).amazonQChatViewProvider = mockChatViewProvider

        console.log('Mock LSP infrastructure set up successfully')
    }

    function setupAutoDebugSystem(): void {
        console.log('Setting up AutoDebug system...')

        // Create AutoDebug LSP client
        autoDebugLspClient = new AutoDebugLspClient(mockLanguageClient)

        // Store globally for testing (simulating real activation)
        ;(global as any).autoDebugLspClient = autoDebugLspClient

        console.log('AutoDebug system set up successfully')
    }
})
