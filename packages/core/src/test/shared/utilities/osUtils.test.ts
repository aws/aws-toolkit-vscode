/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { isNewOsSession } from '../../../shared/utilities/osUtils'
import { InstalledClock } from '@sinonjs/fake-timers'
import { createSandbox, SinonSandbox } from 'sinon'

describe('isNewOsSession', () => {
    let clock: InstalledClock | undefined
    let sandbox: SinonSandbox

    beforeEach(function () {
        sandbox = createSandbox()
    })

    afterEach(function () {
        clock?.uninstall()
        sandbox.restore()
    })

    it('unix-like: returns true when expected', async () => {
        const uptimeStub = sandbox.stub()
        const now = sandbox.stub()
        // We started our computer at 2 minutes since epoch (time - pc uptime)
        // and the comptuer has been on for 1 minute. So the OS started 1 minute since epoch.
        now.returns(60_000 + 60_000)
        uptimeStub.returns(1)

        // On a brand new session the first caller will get true
        assert.strictEqual(await isNewOsSession(now, uptimeStub), true)
        // Subsequent callers will get false
        assert.strictEqual(await isNewOsSession(now, uptimeStub), false)

        // Start a computer session 10 minutes from epoch
        uptimeStub.returns(0)
        now.returns(60_000 * 10)
        assert.strictEqual(await isNewOsSession(now, uptimeStub), true)
        // Anything that is within a 5 second threshold of the last session time, is considered the same session
        now.returns(60_000 * 10 + 5000)
        assert.strictEqual(await isNewOsSession(now, uptimeStub), false)
        now.returns(60_000 * 10 + 5000 + 1)
        assert.strictEqual(await isNewOsSession(now, uptimeStub), true)

        // A non-zero uptime
        uptimeStub.returns(5) // The computer has been running for 5 minutes already, so the start time is relative to this.
        now.returns(60_000 * 10 + 5000 + 60_000 * 10) // 5 minutes since last session
        // Nothing changes since the diff between uptime and the last start has not changed
        assert.strictEqual(await isNewOsSession(now, uptimeStub), true)
    })
})
