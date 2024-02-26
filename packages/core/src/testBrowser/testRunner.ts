/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The following was influenced by this guide: https://code.visualstudio.com/api/extension-guides/web-extensions
 */

import 'mocha' // Imports mocha for the browser, defining the `mocha` global.
import * as vscode from 'vscode'
import { VSCODE_EXTENSION_ID } from '../shared/extensions'

export async function run(): Promise<void> {
    await activateToolkitExtension()
    return new Promise(async (resolve, reject) => {
        setupMocha()
        gatherTestFiles()

        try {
            runMochaTests(resolve, reject)
        } catch (err) {
            console.error(err)
            reject(err)
        }
    })
}

function setupMocha() {
    mocha.setup({
        ui: 'bdd',
        reporter: undefined,
    })
}

function gatherTestFiles() {
    // Bundles all files in the current directory matching `*.test`
    const importAll = (r: __WebpackModuleApi.RequireContext) => r.keys().forEach(r)
    importAll(require.context('.', true, /\.test$/))
}

/**
 * Typically extensions activate depending on their configuration in `package.json#activationEvents`, but in tests
 * there is a race condition for when the extension has finished activating and when we start the tests.
 *
 * So this function ensures the extension has fully activated.
 */
async function activateToolkitExtension() {
    await vscode.extensions.getExtension(VSCODE_EXTENSION_ID.awstoolkitcore)?.activate()
}

function runMochaTests(resolve: (value: void | PromiseLike<void>) => void, reject: (reason?: any) => void) {
    mocha.run(failures => {
        if (failures > 0) {
            reject(new Error(`${failures} tests failed.`))
        } else {
            resolve()
        }
    })
}
