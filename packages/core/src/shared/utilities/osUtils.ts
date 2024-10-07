/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'
import * as os from 'os'

/**
 * Checks if the current OS session is new.
 *
 * @returns `true` if this is the First call to this function across all extension instances
 * since the OS was last restarted, subsequent calls return `false`.
 *
 * Use this function to perform one-time initialization tasks that should only happen
 * once per OS session, regardless of how many extension instances are running.
 */
export async function isNewOsSession(now = () => globals.clock.Date.now(), uptime = () => os.uptime()) {
    // Windows does not have an ephemeral /tmp/ folder that deletes on shutdown, while unix-like os's do.
    // So in Windows we calculate the start time and see if it changed from the previous known start time.
    const lastStartTime = globals.globalState.tryGet('lastOsStartTime', Number)
    // uptime() returns seconds, convert to ms
    const currentOsStartTime = now() - uptime() * 1000 * 60

    if (lastStartTime === undefined) {
        await globals.globalState.update('lastOsStartTime', currentOsStartTime)
        return true
    }

    // If the current start time is later than the last, it means we are in a new session since they should be the same value.
    // But to account for small differences in how the current time is calculate, we add in a 5 second buffer.
    if (currentOsStartTime - 1000 * 5 > lastStartTime) {
        await globals.globalState.update('lastOsStartTime', currentOsStartTime)
        return true
    }

    return false
}
