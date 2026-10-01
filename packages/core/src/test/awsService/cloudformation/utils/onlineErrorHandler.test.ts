/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { ResponseError } from 'vscode-languageclient'
import { handleLspError } from '../../../../awsService/cloudformation/utils/onlineErrorHandler'
import { getTestWindow } from '../../../shared/vscode/window'

describe('handleLspError', function () {
    let sandbox: sinon.SinonSandbox
    let executeCommandStub: sinon.SinonStub

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand')
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('Non-LSP Errors', function () {
        it('should handle regular Error without context', async function () {
            const error = new Error('Something went wrong')
            await handleLspError(error)
            const message = getTestWindow().getFirstMessage()
            assert.strictEqual(message.message, 'Something went wrong')
        })

        it('should handle regular Error with context', async function () {
            const error = new Error('Something went wrong')
            await handleLspError(error, 'Error deploying template')
            const message = getTestWindow().getFirstMessage()
            assert.strictEqual(message.message, 'Error deploying template: Something went wrong')
        })

        it('should handle string error', async function () {
            await handleLspError('String error')
            const message = getTestWindow().getFirstMessage()
            assert.strictEqual(message.message, 'String error')
        })

        it('should handle unknown error type', async function () {
            await handleLspError({ random: 'object' })
            assert.strictEqual(getTestWindow().shownMessages.length, 1)
        })
    })

    describe('ExpiredCredentials Error (-32003)', function () {
        it('should show Re-authenticate button when requiresReauth is true', async function () {
            const error = new ResponseError(-32_003, 'AWS credentials are invalid or expired', {
                requiresReauth: true,
                retryable: false,
            })
            getTestWindow().onDidShowMessage((message) => {
                message.selectItem('Re-authenticate')
            })
            await handleLspError(error)
            const message = getTestWindow().getFirstMessage()
            assert.strictEqual(message.message, 'AWS credentials are invalid or expired')
            assert.ok(executeCommandStub.calledWith('aws.toolkit.login'))
        })

        it('should not trigger login if user dismisses', async function () {
            const error = new ResponseError(-32_003, 'AWS credentials are invalid or expired', {
                requiresReauth: true,
                retryable: false,
            })
            getTestWindow().onDidShowMessage((message) => {
                message.dispose()
            })
            await handleLspError(error)
            const message = getTestWindow().getFirstMessage()
            assert.strictEqual(message.message, 'AWS credentials are invalid or expired')
            assert.ok(executeCommandStub.notCalled)
        })

        it('should show message without button when requiresReauth is false', async function () {
            const error = new ResponseError(-32_003, 'AWS credentials are invalid or expired', {
                requiresReauth: false,
                retryable: false,
            })
            await handleLspError(error)
            const message = getTestWindow().getFirstMessage()
            assert.strictEqual(message.message, 'AWS credentials are invalid or expired')
            assert.ok(executeCommandStub.notCalled)
        })

        it('should include context in message', async function () {
            const error = new ResponseError(-32_003, 'AWS credentials are invalid or expired', {
                requiresReauth: true,
                retryable: false,
            })
            getTestWindow().onDidShowMessage((message) => {
                message.dispose()
            })
            await handleLspError(error, 'Error deploying template')
            const message = getTestWindow().getFirstMessage()
            assert.strictEqual(message.message, 'Error deploying template: AWS credentials are invalid or expired')
        })
    })

    describe('NoAuthentication Error (-32002)', function () {
        it('should show Re-authenticate button when requiresReauth is true', async function () {
            const error = new ResponseError(-32_002, 'No AWS credentials configured', {
                requiresReauth: true,
                retryable: false,
            })
            getTestWindow().onDidShowMessage((message) => {
                message.selectItem('Re-authenticate')
            })
            await handleLspError(error)
            const message = getTestWindow().getFirstMessage()
            assert.strictEqual(message.message, 'No AWS credentials configured')
            assert.ok(executeCommandStub.calledWith('aws.toolkit.login'))
        })

        it('should show message without button when requiresReauth is false', async function () {
            const error = new ResponseError(-32_002, 'No AWS credentials configured', {
                requiresReauth: false,
                retryable: false,
            })
            await handleLspError(error)
            const message = getTestWindow().getFirstMessage()
            assert.strictEqual(message.message, 'No AWS credentials configured')
            assert.ok(executeCommandStub.notCalled)
        })
    })

    describe('NoInternet Error (-32001)', function () {
        it('should show message without retry button', async function () {
            const error = new ResponseError(-32_001, 'Network error occurred while contacting AWS', {
                retryable: true,
                requiresReauth: false,
            })
            await handleLspError(error)
            const message = getTestWindow().getFirstMessage()
            assert.strictEqual(message.message, 'Network error occurred while contacting AWS')
        })

        it('should include context in message', async function () {
            const error = new ResponseError(-32_001, 'Network error occurred while contacting AWS', {
                retryable: true,
                requiresReauth: false,
            })
            await handleLspError(error, 'Error loading stacks')
            const message = getTestWindow().getFirstMessage()
            assert.strictEqual(message.message, 'Error loading stacks: Network error occurred while contacting AWS')
        })
    })

    describe('AwsServiceError (-32004)', function () {
        it('should show message when retryable is true', async function () {
            const error = new ResponseError(-32_004, 'AWS service error: Stack not found', {
                retryable: true,
                requiresReauth: false,
            })
            await handleLspError(error)
            const message = getTestWindow().getFirstMessage()
            assert.strictEqual(message.message, 'AWS service error: Stack not found')
        })

        it('should show message when retryable is false', async function () {
            const error = new ResponseError(-32_004, 'AWS service error: Access denied', {
                retryable: false,
                requiresReauth: false,
            })
            await handleLspError(error)
            const message = getTestWindow().getFirstMessage()
            assert.strictEqual(message.message, 'AWS service error: Access denied')
        })

        it('should include context in message', async function () {
            const error = new ResponseError(-32_004, 'AWS service error: Stack not found', {
                retryable: false,
                requiresReauth: false,
            })
            await handleLspError(error, 'Error viewing stack')
            const message = getTestWindow().getFirstMessage()
            assert.strictEqual(message.message, 'Error viewing stack: AWS service error: Stack not found')
        })
    })

    describe('Unknown LSP Error Code', function () {
        it('should show message for unknown error code', async function () {
            const error = new ResponseError(-99_999, 'Unknown error')
            await handleLspError(error)
            const message = getTestWindow().getFirstMessage()
            assert.strictEqual(message.message, 'Unknown error')
        })

        it('should include context for unknown error code', async function () {
            const error = new ResponseError(-99_999, 'Unknown error')
            await handleLspError(error, 'Error performing operation')
            const message = getTestWindow().getFirstMessage()
            assert.strictEqual(message.message, 'Error performing operation: Unknown error')
        })
    })

    describe('Edge Cases', function () {
        it('should handle LSP error without data field', async function () {
            const error = new ResponseError(-32_003, 'Credentials expired')
            await handleLspError(error)
            const message = getTestWindow().getFirstMessage()
            assert.strictEqual(message.message, 'Credentials expired')
        })

        it('should handle null error', async function () {
            await handleLspError(undefined)
            assert.strictEqual(getTestWindow().shownMessages.length, 1)
        })

        it('should handle undefined error', async function () {
            await handleLspError(undefined)
            assert.strictEqual(getTestWindow().shownMessages.length, 1)
        })
    })
})
