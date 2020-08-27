/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Before/After hooks for all integration tests.
 */
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

before(async () => {
    // Needed for getLogger().
    await activateExtension(VSCODE_EXTENSION_ID.awstoolkit)
})

after(async () => {
    console.log(`silenced ${silenceLogMessages} log messages`)
})
