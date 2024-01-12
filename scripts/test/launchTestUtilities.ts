/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from 'child_process'
import packageJson from '../../package.json'
import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron'
import { join, resolve } from 'path'
import { runTests } from '@vscode/test-electron'
import { VSCODE_EXTENSION_ID } from '../../src/shared/extensions'

const envvarVscodeTestVersion = 'VSCODE_TEST_VERSION'

const stable = 'stable'
const minimum = 'minimum'

const disableWorkspaceTrust = '--disable-workspace-trust'

export const integrationSuite = 'integration'
export const e2eSuite = 'e2e'

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
        console.log('output: %s', spawnResult.output)
        throw new Error(`VS Code CLI command failed (exit-code: ${spawnResult.status}): ${cli} ${cmdArgs}`)
    }

    if (spawnResult.error) {
        throw spawnResult.error
    }

    return spawnResult.stdout
}

export async function installVSCodeExtension(vsCodeExecutablePath: string, extensionIdentifier: string): Promise<void> {
    // HACK: `sam.test.ts` Codelens test was failing for python due to bug in newer version, so lock to last working version.
    // Edge Case: This specific python version does not work with the "minimum" vscode version, so we do not override it as it
    // will choose its own python extension version that works.
    if (extensionIdentifier === VSCODE_EXTENSION_ID.python && process.env[envvarVscodeTestVersion] !== minimum) {
        extensionIdentifier = `${VSCODE_EXTENSION_ID.python}@2023.20.0`
    }

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
    const vsCodeVersion = packageJson.engines.vscode

    // We assume that we specify a minium, so it matches ^<number>, so remove ^'s
    const sanitizedVersion = vsCodeVersion.replace('^', '')
    console.log(`Using minimum VSCode version specified in package.json: ${sanitizedVersion}`)
    return sanitizedVersion
}

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

export async function runToolkitTests(suiteName: string, relativeEntryPoint: string) {
    try {
        console.log(`Running ${suiteName} test suite...`)
        const vsCodeExecutablePath = await setupVSCode()
        const cwd = process.cwd()
        const testEntrypoint = resolve(cwd, relativeEntryPoint)
        const workspacePath = join(cwd, 'dist', 'src', 'testFixtures', 'workspaceFolder')
        console.log(`Starting tests: ${testEntrypoint}`)

        const disableExtensions = await getCliArgsToDisableExtensions(vsCodeExecutablePath, {
            except: [
                VSCODE_EXTENSION_ID.python,
                VSCODE_EXTENSION_ID.yaml,
                VSCODE_EXTENSION_ID.jupyter,
                VSCODE_EXTENSION_ID.go,
                VSCODE_EXTENSION_ID.java,
                VSCODE_EXTENSION_ID.javadebug,
                VSCODE_EXTENSION_ID.git,
                VSCODE_EXTENSION_ID.remotessh,
            ],
        })
        const args = {
            vscodeExecutablePath: vsCodeExecutablePath,
            extensionDevelopmentPath: cwd,
            extensionTestsPath: testEntrypoint,
            launchArgs: [...disableExtensions, workspacePath, disableWorkspaceTrust],
            extensionTestsEnv: {
                ['DEVELOPMENT_PATH']: cwd,
                ['AWS_TOOLKIT_AUTOMATION']: suiteName,
            },
        }
        console.log(`runTests() args:\n${JSON.stringify(args, undefined, 2)}`)
        const result = await runTests(args)

        console.log(`Finished running ${suiteName} test suite with result code: ${result}`)
        process.exit(result)
    } catch (err) {
        console.error(err)
        console.error('Failed to run tests')
        process.exit(1)
    }
}
