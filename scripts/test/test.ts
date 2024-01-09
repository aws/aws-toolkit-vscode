/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolve } from 'path'
import { runTests } from '@vscode/test-electron'
import { setupVSCodeTestInstance } from './launchTestUtilities'
await (async () => {
    try {
        console.log('Running Main test suite...')

        const vsCodeExecutablePath = await setupVSCodeTestInstance()
        const rootDir = process.cwd()
        const testEntrypoint = resolve(rootDir, 'dist/src/test/index.js')
        const testWorkspace = resolve(rootDir, 'src/testFixtures/workspaceFolder')
        console.log(`Starting tests: ${testEntrypoint}`)

        const result = await runTests({
            vscodeExecutablePath: vsCodeExecutablePath,
            extensionDevelopmentPath: rootDir,
            extensionTestsPath: testEntrypoint,
            // For verbose VSCode logs, add "--verbose --log debug". c2165cf48e62c
            launchArgs: [testWorkspace],
            extensionTestsEnv: {
                ['DEVELOPMENT_PATH']: rootDir,
                ['AWS_TOOLKIT_AUTOMATION']: 'unit',
            },
        })

        console.log(`Finished running Main test suite with result code: ${result}`)
        process.exit(result)
    } catch (err) {
        console.error(err)
        console.error('Failed to run tests')
        process.exit(1)
    }
})()
