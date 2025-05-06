/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import * as sinon from 'sinon'
import { resetCodeWhispererGlobalVariables } from 'aws-core-vscode/test'
import { assertTelemetryCurried, getTestWindow } from 'aws-core-vscode/test'
import { AuthUtil, awsIdSignIn, showCodeWhispererConnectionPrompt } from 'aws-core-vscode/codewhisperer'
import { SsoAccessTokenProvider, constants } from 'aws-core-vscode/auth'

describe('showConnectionPrompt', function () {
    let isBuilderIdConnection: sinon.SinonStub

    beforeEach(async function () {
        await resetCodeWhispererGlobalVariables()
        isBuilderIdConnection = sinon.stub(AuthUtil.instance, 'isBuilderIdConnection')
        isBuilderIdConnection.resolves()

        // Stub useDeviceFlow so we always use DeviceFlow for auth
        sinon.stub(SsoAccessTokenProvider, 'useDeviceFlow').returns(true)
    })

    afterEach(function () {
        sinon.restore()
    })

    it('can select connect to AwsBuilderId', async function () {
        getTestWindow().onDidShowQuickPick(async (picker) => {
            await picker.untilReady()
            picker.acceptItem(picker.items[0])
        })

        await showCodeWhispererConnectionPrompt()

        const assertTelemetry = assertTelemetryCurried('ui_click')
        assertTelemetry({ elementId: 'connection_optionBuilderID' })
        assert.ok(isBuilderIdConnection)
    })

    it('connectToAwsBuilderId calls AuthUtil login with builderIdStartUrl', async function () {
        sinon.stub(vscode.commands, 'executeCommand')
        const loginStub = sinon.stub(AuthUtil.instance, 'login').resolves()

        await awsIdSignIn()

        assert.strictEqual(loginStub.called, true)
        assert.strictEqual(loginStub.firstCall.args[0], constants.builderIdStartUrl)
    })
})
