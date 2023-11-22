/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import sinon from 'sinon'
import { AuthController } from '../../../amazonq/auth/controller'
import { reconnect, showManageCwConnections } from '../../../codewhisperer/commands/basicCommands'
import assert from 'assert'
import { placeholder } from '../../../shared/vscode/commands2'
import { amazonQChatSource } from '../../../codewhisperer/commands/types'

describe('AuthController', () => {
    let authController: AuthController
    let showManageCwConnectionsStub: any
    let reconnectStub: any

    beforeEach(() => {
        authController = new AuthController()
        showManageCwConnectionsStub = sinon.stub(showManageCwConnections, 'execute')
        reconnectStub = sinon.stub(reconnect, 'execute')
    })

    afterEach(() => {
        sinon.restore()
    })

    it('should call showManageCwConnections for "use-supported-auth"', () => {
        authController.handleAuth('use-supported-auth')

        assert.strictEqual(showManageCwConnectionsStub.calledWith(placeholder, amazonQChatSource), true)
    })

    it('should call showManageCwConnections for "full-auth"', () => {
        authController.handleAuth('full-auth')

        assert.strictEqual(showManageCwConnectionsStub.calledWith(placeholder, amazonQChatSource), true)
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
