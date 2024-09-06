/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import sinon from 'sinon'
import { AuthController } from 'aws-core-vscode/amazonq'
import { reconnect, amazonQChatSource } from 'aws-core-vscode/codewhisperer'
import assert from 'assert'
import { placeholder } from 'aws-core-vscode/shared'

describe('AuthController', () => {
    let authController: AuthController
    let reconnectStub: any

    beforeEach(() => {
        authController = new AuthController()
        reconnectStub = sinon.stub(reconnect, 'execute')
    })

    afterEach(() => {
        sinon.restore()
    })

    it('should call reconnect for "missing_scopes"', () => {
        authController.handleAuth('missing_scopes')

        assert.strictEqual(reconnectStub.calledWith(placeholder, amazonQChatSource), true)
    })

    it('should call reconnect for "re-auth"', () => {
        authController.handleAuth('re-auth')

        assert.strictEqual(reconnectStub.calledWith(placeholder, amazonQChatSource), true)
    })
})
