/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from 'child_process'
import * as manifest from '../../package.json'
import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron'

const envvarVscodeTestVersion = 'VSCODE_TEST_VERSION'

const stable = 'stable'
const minimum = 'minimum'

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
    let vsCodeVersion = process.env[envvarVscodeTestVersion]
    if (!vsCodeVersion) {
        vsCodeVersion = stable
    } else if (vsCodeVersion === minimum) {
        vsCodeVersion = getMinVsCodeVersion()
    }

    console.log(`Setting up VS Code test instance, version: ${vsCodeVersion}`)
    const platform = process.platform === 'win32' ? 'win32-x64-archive' : undefined
    const vsCodeExecutablePath = await downloadAndUnzipVSCode(vsCodeVersion, platform)
    console.log(`VS Code test instance location: ${vsCodeExecutablePath}`)
    console.log(await invokeVSCodeCli(vsCodeExecutablePath, ['--version']))

    return vsCodeExecutablePath
}

export async function invokeVSCodeCli(vsCodeExecutablePath: string, args: string[]): Promise<string> {
    const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(vsCodeExecutablePath)
    const cmdArgs = [...cliArgs, ...args]

    // Workaround: set --user-data-dir to avoid this error in CI:
    // "You are trying to start Visual Studio Code as a super user …"
    if (process.env.AWS_TOOLKIT_TEST_USER_DIR) {
        cmdArgs.push('--user-data-dir', process.env.AWS_TOOLKIT_TEST_USER_DIR)
    }

    console.log(`Invoking vscode CLI command:\n    "${cli}" ${JSON.stringify(cmdArgs)}`)
    const spawnResult = child_process.spawnSync(cli, cmdArgs, {
        encoding: 'utf-8',
        stdio: 'pipe',
    })

    if (spawnResult.status !== 0) {
        throw new Error(`VS Code CLI command failed (exit-code: ${spawnResult.status}): ${cli} ${cmdArgs}`)
    }

    if (spawnResult.error) {
        throw spawnResult.error
    }

    return spawnResult.stdout
}

export async function installVSCodeExtension(vsCodeExecutablePath: string, extensionIdentifier: string): Promise<void> {
    console.log(`Installing VS Code Extension: ${extensionIdentifier}`)
    console.log(await invokeVSCodeCli(vsCodeExecutablePath, ['--install-extension', extensionIdentifier]))
}

/**
 * Alternative to the `--disable-extensions` CLI flag which allows us to
 * selectively keep some extensions enabled.
 *
 * @param vsCodeExecutablePath Path to vscode CLI program.
 * @param exceptIds List of extension ids that should *not* be disabled.
 *
 * @returns List of args which the caller is expected to pass to vscode CLI, of the form:
 * ["--disable-extension", "foo.bar.baz", "--disable-extension", ...]
 */
export async function getCliArgsToDisableExtensions(
    vsCodeExecutablePath: string,
    params: { except: string[] }
): Promise<string[]> {
    console.log(`Disabling all VS Code extensions *except*: ${params.except}`)
    const output = await invokeVSCodeCli(vsCodeExecutablePath, ['--list-extensions'])
    const foundExtensions = output.split('\n')
    const ids: string[] = []
    for (const extId of foundExtensions) {
        if (extId.trim() && !params.except.includes(extId)) {
            ids.push('--disable-extension')
            ids.push(extId)
        }
    }
    return ids
}

export function getMinVsCodeVersion(): string {
    const vsCodeVersion = manifest.engines.vscode

    // We assume that we specify a minium, so it matches ^<number>, so remove ^'s
    const sanitizedVersion = vsCodeVersion.replace('^', '')
    console.log(`Using minimum VSCode version specified in package.json: ${sanitizedVersion}`)
    return sanitizedVersion
}
