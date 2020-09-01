/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolve } from 'path'
import { runTests } from 'vscode-test'
import { setupVSCodeTestInstance } from './launchTestUtilities'
import { env } from 'process'

// tslint:disable-next-line: no-floating-promises
;(async () => {
    try {
        console.log('Running Main test suite...')

        env['AWS_TOOLKIT_IGNORE_WEBPACK_BUNDLE'] = 'true'
        const vsCodeExecutablePath = await setupVSCodeTestInstance()
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
