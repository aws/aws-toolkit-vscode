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
 * Downloads and extracts a copy of VSCode to run tests against.
 *
 * Prints the result of `code --version`.
 *
 * Test suites can set up an experimental instance of VSCode however they want.
 * This method provides the common use-case, pulling down the latest version (aka 'stable').
 * The VSCode version under test can be altered by setting the environment variable
 * VSCODE_TEST_VERSION prior to running the tests.
 */
export async function setupVSCodeTestInstance(): Promise<string> {
    let vsCodeVersion = process.env[ENVVAR_VSCODE_TEST_VERSION]
    if (!vsCodeVersion) {
        vsCodeVersion = STABLE
    } else if (vsCodeVersion === MINIMUM) {
        vsCodeVersion = getMinVsCodeVersion()
    }

    console.log(`Setting up VSCode test instance, version: ${vsCodeVersion}`)
    // Sample vscode executable path:
    //      C:\codebuild\tmp\…\.vscode-test\vscode-insiders\Code - Insiders.exe
    // Sample vscode CLI path:
    //      C:\codebuild\tmp\…\.vscode-test\vscode-insiders\bin\code-insiders.cmd
    const vscodePath = await downloadAndUnzipVSCode(vsCodeVersion)
    console.log(`VSCode test instance: ${vscodePath}`)
    console.log(await invokeVSCodeCli(vscodePath, ['--version']))

    return vscodePath
}

export async function invokeVSCodeCli(vscodeExePath: string, args: string[]): Promise<Buffer> {
    const cli = resolveCliPathFromVSCodeExecutablePath(vscodeExePath)

    const cmdArgs = [...args]

    // Workaround: set --user-data-dir to avoid this error in CI:
    // "You are trying to start Visual Studio Code as a super user …"
    if (process.env.AWS_TOOLKIT_TEST_USER_DIR) {
        cmdArgs.push('--user-data-dir', process.env.AWS_TOOLKIT_TEST_USER_DIR)
    }

    console.log(`Invoking VSCode CLI:\n    "${cli}" ${JSON.stringify(cmdArgs)}`)
    try {
        const spawnResult = child_process.spawnSync(cli, cmdArgs, {
            encoding: 'utf-8',
            stdio: 'pipe',
            shell: false,
        })

        if (spawnResult.status !== 0) {
            throw new Error(`vscode CLI failed (exit-code: ${JSON.stringify(spawnResult)}): ${cli} ${cmdArgs}`)
        }

        if (spawnResult.error) {
            throw spawnResult.error
        }

        return spawnResult.stdout
    } catch (e) {
        console.log(`error: invokeVSCodeCli() failed:\n${e}`)
        throw e
    }
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
    const foundExtensions = output.toString('utf8').split('\n')
    const ids: string[] = []
    for (const extId of foundExtensions) {
        if (extId.trim() && !params.except.includes(extId)) {
            ids.push('--disable-extension')
            ids.push(extId)
        }
    }
    return ids
}

function getMinVsCodeVersion(): string {
    const vsCodeVersion: string | undefined = require(path.join('..', 'package.json'))?.engines?.vscode
    if (!vsCodeVersion) {
        throw Error('Minimum version specified to run tests, but package.json does not have a .engine.vscode!')
    }
    // We assume that we specify a minium, so it matches ^<number>, so remove ^'s
    const sanitizedVersion = vsCodeVersion.replace('^', '')
    console.log(`Using minimum VSCode version specified in package.json: ${sanitizedVersion}`)
    return sanitizedVersion
}
