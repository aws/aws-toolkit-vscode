/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { resetCodeWhispererGlobalVariables } from 'aws-core-vscode/test'
import { getLogger } from 'aws-core-vscode/shared'
import { resetIntelliSenseState, vsCodeState } from 'aws-core-vscode/codewhisperer'

describe('globalStateUtil', function () {
    let loggerSpy: sinon.SinonSpy

    beforeEach(async function () {
        await resetCodeWhispererGlobalVariables()
        vsCodeState.isIntelliSenseActive = true
        loggerSpy = sinon.spy(getLogger(), 'info')
    })

    this.afterEach(function () {
        sinon.restore()
    })

    it('Should skip when CodeWhisperer is turned off', async function () {
        const isManualTriggerEnabled = false
        const isAutomatedTriggerEnabled = false
        resetIntelliSenseState(isManualTriggerEnabled, isAutomatedTriggerEnabled, true)
        assert.ok(!loggerSpy.called)
    })

    it('Should skip when invocationContext is not active', async function () {
        vsCodeState.isIntelliSenseActive = false
        resetIntelliSenseState(false, false, true)
        assert.ok(!loggerSpy.called)
    })

    it('Should skip when no valid recommendations', async function () {
        resetIntelliSenseState(true, true, false)
        assert.ok(!loggerSpy.called)
    })
})
