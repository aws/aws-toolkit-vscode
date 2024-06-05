/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Before/After hooks for all integration tests.
 */
import vscode from 'vscode'
import { getLogger } from '../shared/logger'
import { WinstonToolkitLogger } from '../shared/logger/winstonToolkitLogger'
import { mapTestErrors, normalizeError, patchObject, setRunnableTimeout } from '../test/setupUtil'
import { getTestWindow, resetTestWindow } from '../test/shared/vscode/window'
import * as sinon from 'sinon'
import * as tokenProvider from '../auth/sso/ssoAccessTokenProvider'
import { DeviceFlowAuthorization } from '../auth/sso/ssoAccessTokenProvider'

// ASSUMPTION: Tests are not run concurrently

let windowPatch: vscode.Disposable
const maxTestDuration = 300_000
const globalSandbox = sinon.createSandbox()

export async function mochaGlobalSetup(extensionId: string) {
    return async function (this: Mocha.Runner) {
        console.log('globalSetup: before()')

        // Prevent CI from hanging by forcing a timeout on both hooks and tests
        this.on('hook', hook => setRunnableTimeout(hook, maxTestDuration))
        this.on('test', test => setRunnableTimeout(test, maxTestDuration))

        // Shows the full error chain when tests fail
        mapTestErrors(this, normalizeError)

        // Set up a listener for proxying login requests
        patchWindow()

        // always use device code authorization
        patchAuth()

        // Needed for getLogger().
        await vscode.extensions.getExtension(extensionId)?.activate()

        // Log as much as possible, useful for debugging integration tests.
        getLogger().setLogLevel('debug')
        if (getLogger() instanceof WinstonToolkitLogger) {
            ;(getLogger() as WinstonToolkitLogger).logToConsole()
        }
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
    after(this: Mocha.Context) {
        globalSandbox.restore()
    },
}

function patchWindow() {
    windowPatch?.dispose()
    resetTestWindow()
    windowPatch = patchObject(vscode, 'window', getTestWindow())
}

/**
 * We have to fall back to device flow authorization until:
 * 1. We can find a way to automatically press the "trust external url" popup
 * 2. We support the authorization grant flow in the auth lambda
 * otherwise we get: "Error: DialogService: refused to show dialog in tests. Contents: Do you want Code to open the external website?"
 */
function patchAuth() {
    globalSandbox.stub(tokenProvider.SsoAccessTokenProvider, 'create').callsFake((profile, cache, oidc) => {
        return new DeviceFlowAuthorization(profile, cache, oidc)
    })
}
