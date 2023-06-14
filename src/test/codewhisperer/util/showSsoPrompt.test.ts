/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import * as sinon from 'sinon'
import { resetCodeWhispererGlobalVariables } from '../testUtil'
import { awsIdSignIn, showConnectionPrompt } from '../../../codewhisperer/util/showSsoPrompt'
import { getTestLogger } from '../../globalSetup.test'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'
import { getTestWindow } from '../../shared/vscode/window'
import { assertTelemetryCurried } from '../../testUtil'

describe('showConnectionPrompt', function () {
    beforeEach(function () {
        resetCodeWhispererGlobalVariables()
    })

    afterEach(function () {
        sinon.restore()
    })

    it('can select connect to AwsBuilderId', async function () {
        const authUtilSpy = sinon.stub(AuthUtil.instance, 'connectToAwsBuilderId')

        getTestWindow().onDidShowQuickPick(async picker => {
            await picker.untilReady()
            picker.acceptItem(picker.items[0])
        })

        await showConnectionPrompt()

        assert.ok(authUtilSpy.called)
        const assertTelemetry = assertTelemetryCurried('ui_click')
        assertTelemetry({ elementId: 'connection_optionBuilderID' })
    })

    it('connectToAwsBuilderId logs that AWS ID sign in was selected', async function () {
        sinon.stub(AuthUtil.instance, 'connectToAwsBuilderId').resolves()
        sinon.stub(vscode.commands, 'executeCommand')

        await awsIdSignIn()

        const loggedEntries = getTestLogger().getLoggedEntries()
        assert.ok(loggedEntries.find(entry => entry === 'selected AWS ID sign in'))
    })
})
