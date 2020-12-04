/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolve } from 'path'
import { runTests } from 'vscode-test'
import { VSCODE_EXTENSION_ID } from '../src/shared/extensions'
import { installVSCodeExtension, setupVSCodeTestInstance } from './launchTestUtilities'
import { env } from 'process'

async function setupVSCode(): Promise<string> {
    const vsCodeExecutablePath = await setupVSCodeTestInstance()
    await installVSCodeExtension(vsCodeExecutablePath, VSCODE_EXTENSION_ID.yaml)
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
            // TODO: remove "--verbose --log ..." after some bake-time on master branch (ETA: 2020-12-15).
            launchArgs: ['--verbose', '--log', 'debug', testWorkspace],
        })

        console.log(`Finished running Main test suite with result code: ${result}`)
        process.exit(result)
    } catch (err) {
        console.error('Failed to run tests')
        process.exit(1)
    }
})()
