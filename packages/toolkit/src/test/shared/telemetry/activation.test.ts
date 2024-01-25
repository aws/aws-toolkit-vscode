/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'

import { FakeExtensionContext } from '../../fakeExtensionContext'
import {
    handleTelemetryNoticeResponse,
    noticeResponseViewSettings,
    noticeResponseOk,
    TELEMETRY_NOTICE_VERSION_ACKNOWLEDGED,
    hasUserSeenTelemetryNotice,
    setHasUserSeenTelemetryNotice,
} from '../../../shared/telemetry/activation'

describe('handleTelemetryNoticeResponse', function () {
    let extensionContext: vscode.ExtensionContext
    let sandbox: sinon.SinonSandbox

    before(function () {
        sandbox = sinon.createSandbox()
    })

    after(function () {
        sandbox.restore()
    })

    beforeEach(async function () {
        extensionContext = await FakeExtensionContext.create()
    })

    it('does nothing when notice is discarded', async function () {
        await handleTelemetryNoticeResponse(undefined, extensionContext)

        assert.strictEqual(
            extensionContext.globalState.get(TELEMETRY_NOTICE_VERSION_ACKNOWLEDGED),
            undefined,
            'Expected opt out shown state to remain unchanged'
        )
    })

    it('handles View Settings response', async function () {
        const executeCommand = sandbox.stub(vscode.commands, 'executeCommand')

        await handleTelemetryNoticeResponse(noticeResponseViewSettings, extensionContext)

        assert.ok(executeCommand.calledOnce, 'Expected to trigger View Settings')
        assert.strictEqual(
            extensionContext.globalState.get(TELEMETRY_NOTICE_VERSION_ACKNOWLEDGED),
            2,
            'Expected opt out shown state to be set'
        )
    })

    it('handles Ok response', async function () {
        await handleTelemetryNoticeResponse(noticeResponseOk, extensionContext)

        assert.strictEqual(
            extensionContext.globalState.get(TELEMETRY_NOTICE_VERSION_ACKNOWLEDGED),
            2,
            'Expected opt out shown state to be set'
        )
    })
})

describe('hasUserSeenTelemetryNotice', async function () {
    let extensionContext: vscode.ExtensionContext
    let sandbox: sinon.SinonSandbox

    before(function () {
        sandbox = sinon.createSandbox()
    })

    after(function () {
        sandbox.restore()
    })

    beforeEach(async function () {
        extensionContext = await FakeExtensionContext.create()
    })

    it('is affected by setHasUserSeenTelemetryNotice', async function () {
        assert.ok(!hasUserSeenTelemetryNotice(extensionContext))
        await setHasUserSeenTelemetryNotice(extensionContext)
        assert.ok(hasUserSeenTelemetryNotice(extensionContext))
    })

    const scenarios = [
        { currentState: undefined, expectedHasSeen: false, desc: 'never seen before' },
        { currentState: 0, expectedHasSeen: false, desc: 'seen an older version' },
        { currentState: 2, expectedHasSeen: true, desc: 'seen the current version' },
        { currentState: 9999, expectedHasSeen: true, desc: 'seen a future version' },
    ]

    scenarios.forEach(scenario => {
        it(scenario.desc, async () => {
            await extensionContext.globalState.update(TELEMETRY_NOTICE_VERSION_ACKNOWLEDGED, scenario.currentState)
            assert.strictEqual(hasUserSeenTelemetryNotice(extensionContext), scenario.expectedHasSeen)
        })
    })
})
