/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import {
    handleTelemetryNoticeResponse,
    noticeResponseViewSettings,
    noticeResponseOk,
    hasUserSeenTelemetryNotice,
    setHasUserSeenTelemetryNotice,
} from '../../../shared/telemetry/activation'
import globals from '../../../shared/extensionGlobals'

describe('handleTelemetryNoticeResponse', function () {
    it('does nothing when notice is discarded', async function () {
        await handleTelemetryNoticeResponse(undefined)
        assert.strictEqual(
            globals.globalState.get('awsTelemetryNoticeVersionAck'),
            undefined,
            'Expected opt out shown state to remain unchanged'
        )
    })

    it('handles View Settings response', async function () {
        await handleTelemetryNoticeResponse(noticeResponseViewSettings)
        assert.strictEqual(
            globals.globalState.get('awsTelemetryNoticeVersionAck'),
            2,
            'Expected opt out shown state to be set'
        )
    })

    it('handles Ok response', async function () {
        await handleTelemetryNoticeResponse(noticeResponseOk)

        assert.strictEqual(
            globals.globalState.get('awsTelemetryNoticeVersionAck'),
            2,
            'Expected opt out shown state to be set'
        )
    })
})

describe('hasUserSeenTelemetryNotice', async function () {
    beforeEach(async function () {})

    it('is affected by setHasUserSeenTelemetryNotice', async function () {
        assert.ok(!hasUserSeenTelemetryNotice())
        await setHasUserSeenTelemetryNotice()
        assert.ok(hasUserSeenTelemetryNotice())
    })

    const scenarios = [
        { currentState: undefined, expectedHasSeen: false, desc: 'never seen before' },
        { currentState: 0, expectedHasSeen: false, desc: 'seen an older version' },
        { currentState: 2, expectedHasSeen: true, desc: 'seen the current version' },
        { currentState: 9999, expectedHasSeen: true, desc: 'seen a future version' },
    ]

    scenarios.forEach((scenario) => {
        it(scenario.desc, async () => {
            await globals.globalState.update('awsTelemetryNoticeVersionAck', scenario.currentState)
            assert.strictEqual(hasUserSeenTelemetryNotice(), scenario.expectedHasSeen)
        })
    })
})
