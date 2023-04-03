/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Before/After hooks for all integration tests.
 */
import * as vscode from 'vscode'
import { VSCODE_EXTENSION_ID } from '../shared/extensions'
import { getLogger } from '../shared/logger'
import { WinstonToolkitLogger } from '../shared/logger/winstonToolkitLogger'
import { activateExtension } from '../shared/utilities/vsCodeUtils'
import { invokeLambda, patchObject, setRunnableTimeout } from '../test/setupUtil'
import { getTestWindow, resetTestWindow } from '../test/shared/vscode/window'

// ASSUMPTION: Tests are not run concurrently

let windowPatch: vscode.Disposable
let authHook: vscode.Disposable
const maxTestDuration = 300_000

export async function mochaGlobalSetup(this: Mocha.Runner) {
    console.log('globalSetup: before()')

    // Prevent CI from hanging by forcing a timeout on both hooks and tests
    this.on('hook', hook => setRunnableTimeout(hook, maxTestDuration))
    this.on('test', test => setRunnableTimeout(test, maxTestDuration))

    // Set up a listener for proxying login requests
    patchWindow()

    // Needed for getLogger().
    await activateExtension(VSCODE_EXTENSION_ID.awstoolkit, false)

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
    authHook?.dispose()
    resetTestWindow()
    authHook = registerAuthHook()
    windowPatch = patchObject(vscode, 'window', getTestWindow())
}

/**
 * Registers a hook to proxy SSO logins to a Lambda function.
 *
 * The function is expected to perform a browser login using the following parameters:
 * * `secret` - a SecretsManager secret containing login credentials.
 * * `userCode` - the user verification code e.g. `ABCD-EFGH`. This is returned by the device authorization flow.
 * * `verificationUri` - the url to login with. This is returned by the device authorization flow.
 */
function registerAuthHook(secret = process.env['LOGIN_SECRET_ARN'], lambdaId = process.env['AUTH_UTIL_LAMBDA_ARN']) {
    return getTestWindow().onDidShowMessage(message => {
        if (message.items[0].title.match(/Copy Code/)) {
            if (!lambdaId) {
                const baseMessage = 'Browser login flow was shown during testing without an authorizer function'
                if (process.env['AWS_TOOLKIT_AUTOMATION'] === 'local') {
                    throw new Error(`${baseMessage}. You may need to login manually before running tests.`)
                } else {
                    throw new Error(`${baseMessage}. Check that environment variables are set correctly.`)
                }
            }

            const openStub = patchObject(vscode.env, 'openExternal', async target => {
                try {
                    await invokeLambda(lambdaId, {
                        secret,
                        userCode: await vscode.env.clipboard.readText(),
                        verificationUri: target.toString(),
                    })
                } finally {
                    openStub.dispose()
                }

                return true
            })

            message.items[0].select()
        }
    })
}
