/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { Auth } from '../../auth/auth'
import { ToolkitError } from '../../shared/errors'
import * as authUtils from '../../auth/utils'

describe('createAndUseConsoleConnection', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('creates connection after successful console login', async function () {
        const executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand').resolves()
        const mockConnection = {
            id: 'profile:test-profile',
            type: 'iam',
            state: 'valid',
            label: 'profile:test-profile',
            getCredentials: sandbox.stub().resolves({}),
        }
        sandbox.stub(Auth.instance, 'getConnection').resolves(mockConnection as any)
        const useConnectionStub = sandbox.stub(Auth.instance, 'useConnection').resolves()

        const result = await authUtils.createAndUseConsoleConnection('test-profile', 'us-east-1')

        assert.ok(executeCommandStub.calledWith('aws.toolkit.auth.consoleLogin', 'test-profile', 'us-east-1'))
        assert.ok(useConnectionStub.calledWith({ id: 'profile:test-profile' }))
        assert.strictEqual(result, mockConnection)
    })

    it('throws ToolkitError when connection not found after console login', async function () {
        sandbox.stub(vscode.commands, 'executeCommand').resolves()
        sandbox.stub(Auth.instance, 'getConnection').resolves(undefined)

        await assert.rejects(
            () => authUtils.createAndUseConsoleConnection('test-profile', 'us-east-1'),
            (err: Error) => {
                assert.ok(err instanceof ToolkitError)
                assert.strictEqual(err.code, 'NoConsoleConnection')
                return true
            }
        )
    })
})

describe('getIAMConnectionOrFallbackToConsole', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('falls back to console credentials when no active connection', async function () {
        sandbox.stub(authUtils, 'getIAMConnection').resolves(undefined)
        const executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand').resolves()
        const mockConnection = {
            id: 'profile:test-function',
            type: 'iam',
            state: 'valid',
            label: 'profile:test-function',
            getCredentials: sandbox.stub().resolves({}),
        }
        sandbox.stub(Auth.instance, 'getConnection').resolves(mockConnection as any)
        sandbox.stub(Auth.instance, 'useConnection').resolves()

        const result = await authUtils.getIAMConnectionOrFallbackToConsole('test-function', 'us-east-1')

        assert.ok(executeCommandStub.calledWith('aws.toolkit.auth.consoleLogin', 'test-function', 'us-east-1'))
        assert.strictEqual(result, mockConnection)
    })

    it('falls back when credentials provider not found', async function () {
        const mockConnection = {
            id: 'profile:stale',
            type: 'iam',
            state: 'invalid',
            label: 'profile:stale',
            getCredentials: sandbox.stub().rejects(new Error('Credentials provider "profile:stale" not found')),
        }
        sandbox.stub(authUtils, 'getIAMConnection').resolves(mockConnection as any)
        // Fall through to console credentials
        sandbox.stub(vscode.commands, 'executeCommand').resolves()
        const newConnection = {
            id: 'profile:test-profile',
            type: 'iam',
            state: 'valid',
            label: 'profile:test-profile',
            getCredentials: sandbox.stub().resolves({}),
        }
        sandbox.stub(Auth.instance, 'getConnection').resolves(newConnection as any)
        sandbox.stub(Auth.instance, 'useConnection').resolves()

        const result = await authUtils.getIAMConnectionOrFallbackToConsole('test-function', 'us-east-1')

        assert.strictEqual(result, newConnection)
    })
})
