/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolve } from 'path'
import { runTests } from 'vscode-test'
import { VSCODE_EXTENSION_ID } from '../src/shared/extensions'
import { installVSCodeExtension, setupVSCodeTestInstance } from './launchTestUtilities'
import { env } from 'process'

/**
 * Amount of time to wait before executing tests.
 * This gives time for extensions to initialize, otherwise the first CodeLens test will fail.
 */
const START_UP_DELAY = 20000

async function setupVSCode(): Promise<string> {
    const vsCodeExecutablePath = await setupVSCodeTestInstance()
    await installVSCodeExtension(vsCodeExecutablePath, VSCODE_EXTENSION_ID.yaml)
    await new Promise(r => setTimeout(r, START_UP_DELAY))
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
            launchArgs: [testWorkspace],
        })

        console.log(`Finished running Main test suite with result code: ${result}`)
        process.exit(result)
    } catch (err) {
        console.error('Failed to run tests')
        process.exit(1)
    }
})()
