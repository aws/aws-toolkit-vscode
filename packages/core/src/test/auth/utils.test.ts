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
import { getTestWindow } from '../shared/vscode/window'

describe('getConnectionIdFromProfile', function () {
    it('constructs connection ID from profile name', function () {
        const result = authUtils.getConnectionIdFromProfile('my-profile')
        assert.strictEqual(result, 'profile:my-profile')
    })

    it('handles profile names with special characters', function () {
        const result = authUtils.getConnectionIdFromProfile('my-profile-123')
        assert.strictEqual(result, 'profile:my-profile-123')
    })
})

describe('setupConsoleConnection', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('creates connection after successful console login', async function () {
        const executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand').resolves()
        const getConnectionStub = sandbox
            .stub(Auth.instance, 'getConnection')
            .resolves({ id: 'profile:test-profile' } as any)
        const useConnectionStub = sandbox.stub(Auth.instance, 'useConnection').resolves()

        await authUtils.setupConsoleConnection('test-profile', 'us-east-1')

        assert.ok(executeCommandStub.calledOnceWith('aws.toolkit.auth.consoleLogin', 'test-profile', 'us-east-1'))
        assert.ok(getConnectionStub.calledOnceWith({ id: 'profile:test-profile' }))
        assert.ok(useConnectionStub.calledOnceWith({ id: 'profile:test-profile' }))
    })

    it('throws error when connection was not created', async function () {
        sandbox.stub(vscode.commands, 'executeCommand').resolves()
        sandbox.stub(Auth.instance, 'getConnection').resolves(undefined)
        getTestWindow().onDidShowMessage((m) => m.close())

        await assert.rejects(
            () => authUtils.setupConsoleConnection('test-profile', 'us-east-1'),
            (err: ToolkitError) => {
                assert.strictEqual(
                    err.message,
                    'Unable to connect to AWS. Console login was cancelled or did not complete successfully.'
                )
                assert.strictEqual(err.cancelled, true)
                return true
            }
        )
    })

    it('throws error when useConnection fails', async function () {
        sandbox.stub(vscode.commands, 'executeCommand').resolves()
        sandbox.stub(Auth.instance, 'getConnection').resolves({ id: 'profile:test-profile' } as any)
        const error = new Error('useConnection failed')
        sandbox.stub(Auth.instance, 'useConnection').rejects(error)

        await assert.rejects(() => authUtils.setupConsoleConnection('test-profile', 'us-east-1'), error)
    })

    it('throws error when console login command fails', async function () {
        const error = new ToolkitError('Console login failed')
        sandbox.stub(vscode.commands, 'executeCommand').rejects(error)

        await assert.rejects(() => authUtils.setupConsoleConnection('test-profile', 'us-east-1'), error)
    })
})
