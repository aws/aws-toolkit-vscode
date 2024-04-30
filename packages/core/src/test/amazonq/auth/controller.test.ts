/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import sinon from 'sinon'
import { AuthController } from '../../../amazonq/auth/controller'
import { reconnect } from '../../../codewhisperer/commands/basicCommands'
import assert from 'assert'
import { placeholder } from '../../../shared/vscode/commands2'
import { amazonQChatSource } from '../../../codewhisperer/commands/types'

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
