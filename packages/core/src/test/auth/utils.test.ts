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
