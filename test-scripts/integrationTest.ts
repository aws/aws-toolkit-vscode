/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { join, resolve } from 'path'
import { runTests } from 'vscode-test'
import { VSCODE_EXTENSION_ID } from '../src/shared/extensions'
import { installVSCodeExtension, setupVSCodeTestInstance, getCliArgsToDisableExtensions } from './launchTestUtilities'

const DISABLE_WORKSPACE_TRUST = '--disable-workspace-trust'

async function setupVSCode(): Promise<string> {
    console.log('Setting up VS Code Test instance...')
    const vsCodeExecutablePath = await setupVSCodeTestInstance()
    await installVSCodeExtension(vsCodeExecutablePath, VSCODE_EXTENSION_ID.python)
    await installVSCodeExtension(vsCodeExecutablePath, VSCODE_EXTENSION_ID.yaml)
    await installVSCodeExtension(vsCodeExecutablePath, VSCODE_EXTENSION_ID.go)
    await installVSCodeExtension(vsCodeExecutablePath, VSCODE_EXTENSION_ID.java)
    await installVSCodeExtension(vsCodeExecutablePath, VSCODE_EXTENSION_ID.javadebug)
    console.log('VS Code Test instance has been set up')
    return vsCodeExecutablePath
}

;(async () => {
    try {
        console.log('Running Integration test suite...')
        const vsCodeExecutablePath = await setupVSCode()
        const cwd = process.cwd()
        const testEntrypoint = resolve(cwd, 'dist', 'src', 'integrationTest', 'index.js')
        const workspacePath = join(cwd, 'dist', 'src', 'testFixtures', 'workspaceFolder')
        console.log(`Starting tests: ${testEntrypoint}`)

        process.env.AWS_TOOLKIT_IGNORE_WEBPACK_BUNDLE = 'true'

        const disableExtensions = await getCliArgsToDisableExtensions(vsCodeExecutablePath, {
            except: [
                VSCODE_EXTENSION_ID.python,
                VSCODE_EXTENSION_ID.yaml,
                VSCODE_EXTENSION_ID.jupyter,
                VSCODE_EXTENSION_ID.go,
                VSCODE_EXTENSION_ID.java,
                VSCODE_EXTENSION_ID.javadebug,
            ],
        })
        const args = {
            vscodeExecutablePath: vsCodeExecutablePath,
            extensionDevelopmentPath: cwd,
            extensionTestsPath: testEntrypoint,
            launchArgs: [...disableExtensions, workspacePath, DISABLE_WORKSPACE_TRUST],
        }
        console.log(`runTests() args:\n${JSON.stringify(args, undefined, 2)}`)
        const result = await runTests(args)

        console.log(`Finished running Integration test suite with result code: ${result}`)
        process.exit(result)
    } catch (err) {
        console.error('Failed to run tests')
        process.exit(1)
    }
})()
