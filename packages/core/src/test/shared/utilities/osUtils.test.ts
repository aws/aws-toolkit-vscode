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
        const uptimeMillisStub = sandbox.stub()
        const now = sandbox.stub()
        // We started our computer at 1 minutes since epoch and the comptuer uptime has been 1 minute.
        // So the OS started at the epoch  (time - uptime).
        now.returns(0) // the epoch time
        uptimeMillisStub.returns(0) // this session has just started

        // On a brand new session the first caller will get true
        assert.strictEqual(await isNewOsSession(now, uptimeMillisStub), true)
        // Subsequent callers will get false
        assert.strictEqual(await isNewOsSession(now, uptimeMillisStub), false)

        // 10 minutes later, same session
        now.returns(1000 * 60 * 10)
        uptimeMillisStub.returns(1000 * 60 * 10) // This scales proportionately with the current time
        // This is still the same session, so we get false
        assert.strictEqual(await isNewOsSession(now, uptimeMillisStub), false)

        // Test the lowerbound of what is considered a new session
        // Pretend we started a new computer session 5 seconds after the initial session
        uptimeMillisStub.returns(0)
        now.returns(5000)
        // Anything that is within a 5 second threshold of the last session time, is considered the SAME session
        assert.strictEqual(await isNewOsSession(now, uptimeMillisStub), false)
        // This is 1 millisecond after the threshold, it is considered a NEW session
        now.returns(5000 + 1)
        assert.strictEqual(await isNewOsSession(now, uptimeMillisStub), true)
    })
})
