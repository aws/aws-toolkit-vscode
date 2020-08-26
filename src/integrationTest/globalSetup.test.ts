/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Before/After hooks for all integration tests.
 */
import * as assert from 'assert'
import { VSCODE_EXTENSION_ID } from '../shared/extensions'
import { activateExtension } from './integrationTestsUtilities'

// ASSUMPTION: Tests are not run concurrently

const oldConsoleLog = console.log
let silenceLogMessages = 0
console.log = function(...args: any[]) {
    // python extension is noisy, it uses console.log() and there are no plans
    // to address it: https://github.com/microsoft/vscode-python/issues/8527
    const msg: string = typeof args === 'string' ? args : (args[0] as string)
    if (msg && msg.includes('Info Python Extension')) {
        silenceLogMessages += 1
        return
    }
    return oldConsoleLog(...args)
}

let timeout: { id: NodeJS.Timeout | undefined; name: string | undefined } = { id: undefined, name: undefined }
function clearTestTimeout() {
    if (timeout.id !== undefined) {
        clearTimeout(timeout.id)
        timeout.id = undefined
        timeout.name = undefined
    }
}

/**
 * Used in integration tests to avoid hangs, because Mocha's timeout() does not
 * seem to work.
 *
 * TODO: See if Mocha's timeout() works after upgrading to Mocha
 * 8.x, then this function can be removed.
 */
export function setTestTimeout(testName: string | undefined, ms: number) {
    if (!testName) {
        throw Error()
    }
    if (timeout.id !== undefined) {
        throw Error(`timeout set by previous test was not cleared: "${timeout.name}"`)
    }
    timeout.name = testName
    timeout.id = setTimeout(function() {
        const name = timeout.name
        clearTestTimeout()
        assert.fail(`Exceeded timeout of ${(ms / 1000).toFixed(1)} seconds: "${name}"`)
    }, ms)
}

// Before all tests begin, once only:
before(async () => {
    console.log('globalSetup: before()')
    // Needed for getLogger().
    await activateExtension(VSCODE_EXTENSION_ID.awstoolkit)
})
// After all tests end, once only:
after(async () => {
    console.log(`silenced ${silenceLogMessages} log messages`)
    console.log('globalSetup: after()')
})

afterEach(function() {
    clearTestTimeout()
})

// TODO: migrate to mochaHooks (requires mocha 8.x)
// https://mochajs.org/#available-root-hooks
//
// export mochaHooks = {
//     // Before all tests begin, once only:
//     beforeAll(async () => {
//         // Needed for getLogger().
//         await activateExtension(VSCODE_EXTENSION_ID.awstoolkit)
//     }),
//     // After all tests end, once only:
//     afterAll(async () => {
//         console.log(`silenced ${silenceLogMessages} log messages`)
//     }),
// }
