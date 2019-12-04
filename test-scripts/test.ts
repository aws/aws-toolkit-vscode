/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolve } from 'path'
import { runTests } from 'vscode-test'
import { setupVSCodeTestInstance } from './launchTestUtilities'

// tslint:disable-next-line: no-floating-promises
;(async () => {
    try {
        console.log('Running Main test suite...')
        const vsCodeExecutablePath = await setupVSCodeTestInstance()
        const cwd = process.cwd()
        const testEntrypoint = resolve(cwd, 'out', 'src', 'test', 'index.js')
        console.log(`Starting tests: ${testEntrypoint}`)

        const result = await runTests({
            vscodeExecutablePath: vsCodeExecutablePath,
            extensionDevelopmentPath: cwd,
            extensionTestsPath: testEntrypoint
        })

        console.log(`Finished running Main test suite with result code: ${result}`)
        process.exit(result)
    } catch (err) {
        console.error('Failed to run tests')
        process.exit(1)
    }
})()
