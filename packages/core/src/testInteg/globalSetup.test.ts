/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Before/After hooks for all integration tests.
 */
import vscode from 'vscode'
import { VSCODE_EXTENSION_ID } from '../shared/extensions'
import { getLogger } from '../shared/logger'
import { WinstonToolkitLogger } from '../shared/logger/winstonToolkitLogger'
import { activateExtension } from '../shared/utilities/vsCodeUtils'
import { mapTestErrors, normalizeError, patchObject, setRunnableTimeout } from '../test/setupUtil'
import { getTestWindow, resetTestWindow } from '../test/shared/vscode/window'
import { setCodeScanLogsOutputChannelId, codeScanLogsOutputChannelId } from '../codewhisperer/models/constants'

// ASSUMPTION: Tests are not run concurrently

let windowPatch: vscode.Disposable
const maxTestDuration = 300_000

export async function mochaGlobalSetup(this: Mocha.Runner) {
    console.log('globalSetup: before()')

    // Prevent CI from hanging by forcing a timeout on both hooks and tests
    this.on('hook', hook => setRunnableTimeout(hook, maxTestDuration))
    this.on('test', test => setRunnableTimeout(test, maxTestDuration))

    // Shows the full error chain when tests fail
    mapTestErrors(this, normalizeError)

    // Set up a listener for proxying login requests
    patchWindow()

    // Needed for getLogger().
    setCodeScanLogsOutputChannelId(
        codeScanLogsOutputChannelId.replace(VSCODE_EXTENSION_ID.awstoolkit, VSCODE_EXTENSION_ID.awstoolkitcore)
    )
    await activateExtension(VSCODE_EXTENSION_ID.awstoolkitcore, false)

    // Log as much as possible, useful for debugging integration tests.
    getLogger().setLogLevel('debug')
    if (getLogger() instanceof WinstonToolkitLogger) {
        ;(getLogger() as WinstonToolkitLogger).logToConsole()
    }
}

export async function mochaGlobalTeardown(this: Mocha.Context) {
    console.log('globalSetup: after()')
    windowPatch.dispose()
}

export const mochaHooks = {
    afterEach(this: Mocha.Context) {
        patchWindow()
    },
}

function patchWindow() {
    windowPatch?.dispose()
    resetTestWindow()
    windowPatch = patchObject(vscode, 'window', getTestWindow())
}
