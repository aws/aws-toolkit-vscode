/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import 'mocha' // Imports mocha for the browser, defining the `mocha` global.
import { activate as activateBrowserExtension } from '../extensionWeb'
import vscode from 'vscode'

export function run(): Promise<void> {
    return new Promise(async (resolve, reject) => {
        setupMocha()
        gatherTestFiles()
        stubVscodeWindow()
        await runBrowserExtensionActivation()

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

function stubVscodeWindow() {
    // We skip this for now since getTestWindow() has transitive imports
    // that import 'fs' and cause issues.
    // TODO: Go through the transitive imports and swap the 'fs' uses
    // with our own browser compatible ones.
    // globalSandbox.replace(vscode, 'window', getTestWindow())
}

/**
 * This is the root function that activates the toolkit extension in a browser
 * context.
 */
async function runBrowserExtensionActivation() {
    await activateBrowserExtension({
        logUri: vscode.Uri.parse('./tempLogFile.txt'),
        subscriptions: [],
    } as any)
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
