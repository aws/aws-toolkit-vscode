/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { invocationContext, recommendations } from '../../../../vector/consolas/models/model'
import { onRejection } from '../../../../vector/consolas/commands/onRejection'
import { resetConsolasGlobalVariables } from '../testUtil'
import { getLogger } from '../../../../shared/logger/logger'

describe('onRejection', function () {
    let loggerSpy: sinon.SinonSpy

    beforeEach(function () {
        resetConsolasGlobalVariables()
        invocationContext.isActive = true
        loggerSpy = sinon.spy(getLogger(), 'info')
    })

    this.afterEach(function () {
        sinon.restore()
    })

    it('Should skip when consolas is turned off', async function () {
        const isManualTriggerEnabled = false
        const isAutomatedTriggerEnabled = false
        await onRejection(isManualTriggerEnabled, isAutomatedTriggerEnabled)
        assert.ok(!loggerSpy.called)
    })

    it('Should skip when invocationContext is not active', async function () {
        invocationContext.isActive = false
        await onRejection(false, false)
        assert.ok(!loggerSpy.called)
    })

    it('Should skip when no valid recommendations', async function () {
        recommendations.response = []
        await onRejection(true, true)
        assert.ok(!loggerSpy.called)
    })

    it('Should log rejected suggestions for one valid response', async function () {
        recommendations.response = [{ content: "print('Hello World!')" }]
        await onRejection(true, true)
        assert.ok(loggerSpy.calledOnce)
        const actual = loggerSpy.getCall(0).args[0]
        assert.strictEqual(actual, "Rejected 0 recommendation : print('Hello World!')")
    })

    it('Should log rejected suggestions for two valid responses', async function () {
        recommendations.response = [{ content: "print('Hello!')" }, { content: "print('Hello World!')" }]
        await onRejection(true, true)
        assert.ok(loggerSpy.calledTwice)
        const actual0 = loggerSpy.getCall(0).args[0]
        const actual1 = loggerSpy.getCall(1).args[0]
        assert.strictEqual(actual0, "Rejected 0 recommendation : print('Hello!')")
        assert.strictEqual(actual1, "Rejected 1 recommendation : print('Hello World!')")
    })
})
