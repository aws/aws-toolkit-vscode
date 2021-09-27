/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolve } from 'path'
import { runTests } from 'vscode-test'
import { setupVSCodeTestInstance } from './launchTestUtilities'
import { env } from 'process'
import { VSCODE_EXTENSION_ID } from '../src/shared/extensions'
import { sleep } from '../src/shared/utilities/promiseUtilities'

/**
 * Amount of time to wait before executing tests.
 * This gives time for extensions to initialize, otherwise the first CodeLens test will fail.
 */
const START_UP_DELAY = 20000
/**
 * Extensions will be permanently disabled during unit tests.
 * Calling 'activate' on an extension will have no effect.
 */
const DISABLE_EXTENSIONS = '--disable-extensions'

async function setupVSCode(): Promise<string> {
    const vsCodeExecutablePath = await setupVSCodeTestInstance()
    await sleep(START_UP_DELAY)
    return vsCodeExecutablePath
}

;(async () => {
    try {
        console.log('Running Main test suite...')

        env['AWS_TOOLKIT_IGNORE_WEBPACK_BUNDLE'] = 'true'
        const vsCodeExecutablePath = await setupVSCode()
        const rootDir = resolve(__dirname, '../')
        const testEntrypoint = resolve(rootDir, 'dist/src/test/index.js')
        const testWorkspace = resolve(rootDir, 'src/testFixtures/workspaceFolder')
        console.log(`Starting tests: ${testEntrypoint}`)

        const result = await runTests({
            vscodeExecutablePath: vsCodeExecutablePath,
            extensionDevelopmentPath: rootDir,
            extensionTestsPath: testEntrypoint,
            // For verbose VSCode logs, add "--verbose --log debug". c2165cf48e62c
            launchArgs: [testWorkspace, DISABLE_EXTENSIONS, VSCODE_EXTENSION_ID.awstoolkit],
        })

        console.log(`Finished running Main test suite with result code: ${result}`)
        process.exit(result)
    } catch (err) {
        console.error('Failed to run tests')
        process.exit(1)
    }
})()
