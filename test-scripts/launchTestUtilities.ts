/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from 'child_process'
import * as path from 'path'
import { downloadAndUnzipVSCode, resolveCliPathFromVSCodeExecutablePath } from 'vscode-test'

const ENVVAR_VSCODE_TEST_VERSION = 'VSCODE_TEST_VERSION'

const STABLE = 'stable'
const MINIMUM = 'minimum'

/**
 * Downloads and unzips a copy of VS Code to run tests against.
 *
 * Prints the result of `code --version`.
 *
 * Test suites can set up an experimental instance of VS Code however they want.
 * This method provides the common use-case, pulling down the latest version (aka 'stable').
 * The VS Code version under test can be altered by setting the environment variable
 * VSCODE_TEST_VERSION prior to running the tests.
 */
export async function setupVSCodeTestInstance(): Promise<string> {
    let vsCodeVersion = process.env[ENVVAR_VSCODE_TEST_VERSION]
    if (!vsCodeVersion) {
        vsCodeVersion = STABLE
    } else if (vsCodeVersion === MINIMUM) {
        vsCodeVersion = getMinVsCodeVersion()
    }

    console.log(`Setting up VS Code test instance, version: ${vsCodeVersion}`)
    const vsCodeExecutablePath = await downloadAndUnzipVSCode(vsCodeVersion)
    console.log(`VS Code test instance location: ${vsCodeExecutablePath}`)

    await invokeVSCodeCli(vsCodeExecutablePath, ['--version'])

    return vsCodeExecutablePath
}

export async function invokeVSCodeCli(vsCodeExecutablePath: string, args: string[]): Promise<Buffer> {
    const vsCodeCliPath = resolveCliPathFromVSCodeExecutablePath(vsCodeExecutablePath)

    let cmdArgs = [...args]

    // Workaround: set --user-data-dir to avoid this error in CI:
    // "You are trying to start Visual Studio Code as a super user …"
    if (process.env.AWS_TOOLKIT_TEST_USER_DIR) {
        cmdArgs.push('--user-data-dir', process.env.AWS_TOOLKIT_TEST_USER_DIR)
    }

    console.log(`Invoking vscode CLI command:\n    "${vsCodeCliPath}" ${JSON.stringify(cmdArgs)}`)
    const spawnResult = child_process.spawnSync(vsCodeCliPath, cmdArgs, {
        encoding: 'utf-8',
        stdio: 'inherit',
    })

    if (spawnResult.status !== 0) {
        throw new Error(`VS Code CLI command failed (exit-code: ${spawnResult.status}): ${vsCodeCliPath} ${cmdArgs}`)
    }

    if (spawnResult.error) {
        throw spawnResult.error
    }

    if (spawnResult.stdout) {
        console.log(spawnResult.stdout)
    }

    return spawnResult.stdout
}

export async function installVSCodeExtension(vsCodeExecutablePath: string, extensionIdentifier: string): Promise<void> {
    console.log(`Installing VS Code Extension: ${extensionIdentifier}`)
    await invokeVSCodeCli(vsCodeExecutablePath, ['--install-extension', extensionIdentifier])
}

function getMinVsCodeVersion(): string {
    // tslint:disable-next-line:no-var-requires no-unsafe-any
    const vsCodeVersion: string | undefined = require(path.join('..', 'package.json'))?.engines?.vscode
    if (!vsCodeVersion) {
        throw Error('Minimum version specified to run tests, but package.json does not have a .engine.vscode!')
    }
    // We assume that we specify a minium, so it matches ^<number>, so remove ^'s
    const sanitizedVersion = vsCodeVersion.replace('^', '')
    console.log(`Using minimum VSCode version specified in package.json: ${sanitizedVersion}`)
    return sanitizedVersion
}
