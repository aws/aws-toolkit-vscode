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
        const cwd = process.cwd()
        const testEntrypoint = resolve(cwd, 'dist', 'src', 'test', 'index.js')
        console.log(`Starting tests: ${testEntrypoint}`)

        const result = await runTests({
            vscodeExecutablePath: vsCodeExecutablePath,
            extensionDevelopmentPath: cwd,
            extensionTestsPath: testEntrypoint,
            // TODO: remove this after some bake-time on master branch (ETA: 2020-12-15).
            launchArgs: ['--verbose', '--log', 'debug'],
        })

        console.log(`Finished running Main test suite with result code: ${result}`)
        process.exit(result)
    } catch (err) {
        console.error('Failed to run tests')
        process.exit(1)
    }
})()
