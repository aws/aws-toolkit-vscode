/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { join, resolve } from 'path'
import { runTests } from 'vscode-test'
import { VSCODE_EXTENSION_ID } from '../src/shared/extensions'
import { installVSCodeExtension, setupVSCodeTestInstance } from './launchTestUtilities'

async function setupVSCode(): Promise<string> {
    console.log('Setting up VS Code Test instance...')
    const vsCodeExecutablePath = await setupVSCodeTestInstance()
    await installVSCodeExtension(vsCodeExecutablePath, VSCODE_EXTENSION_ID.python)
    console.log('VS Code Test instance has been set up')

    return vsCodeExecutablePath
}

// tslint:disable-next-line: no-floating-promises
;(async () => {
    try {
        console.log('Running Integration test suite...')
        const vsCodeExecutablePath = await setupVSCode()
        const cwd = process.cwd()
        const testEntrypoint = resolve(cwd, 'dist', 'src', 'integrationTest', 'index.js')
        const workspacePath = join(cwd, 'dist', 'src', 'testFixtures', 'workspaceFolder')
        console.log(`Starting tests: ${testEntrypoint}`)

        process.env.AWS_TOOLKIT_IGNORE_WEBPACK_BUNDLE = 'true'

        const result = await runTests({
            vscodeExecutablePath: vsCodeExecutablePath,
            extensionDevelopmentPath: cwd,
            extensionTestsPath: testEntrypoint,
            launchArgs: [workspacePath],
        })

        console.log(`Finished running Integration test suite with result code: ${result}`)
        process.exit(result)
    } catch (err) {
        console.error('Failed to run tests')
        process.exit(1)
    }
})()
