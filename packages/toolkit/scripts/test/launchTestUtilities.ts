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
import { TestOptions } from '@vscode/test-electron/out/runTest'

const envvarVscodeTestVersion = 'VSCODE_TEST_VERSION'

const stable = 'stable'
const minimum = 'minimum'

const disableWorkspaceTrust = '--disable-workspace-trust'

type SuiteName = 'integration' | 'e2e' | 'unit' | 'web'

/**
 * This is the generalized method that is used by different test suites (unit, integration, ...) in CI to
 * setup vscode and then run tests. An important thing to note is that in CI we do not have VS Code installed,
 * so this script needs to do this itself.
 *
 * If you want to run the tests manually you should use the `Run & Debug` menu in VS Code instead
 * to be able to use to breakpoints.
 */
export async function runToolkitTests(suite: SuiteName, relativeTestEntryPoint: string, env?: Record<string, string>) {
    try {
        console.log(`Running ${suite} test suite...`)

        const args = await getVSCodeCliArgs({
            vsCodeExecutablePath: await setupVSCodeTestInstance(suite),
            relativeTestEntryPoint,
            suite,
            env,
        })
        console.log(`runTests() args:\n${JSON.stringify(args, undefined, 2)}`)
        const result = await runTests(args)

        console.log(`Finished running ${suite} test suite with result code: ${result}`)
        process.exit(result)
    } catch (err) {
        console.error(err)
        console.error('Failed to run tests')
        process.exit(1)
    }
}

/**
 * Resolves all args for {@link runTests}
 */
async function getVSCodeCliArgs(params: {
    vsCodeExecutablePath: string
    relativeTestEntryPoint: string
    suite: SuiteName
    env?: Record<string, string>
}): Promise<TestOptions> {
    const projectRootDir = process.cwd()

    let disableExtensionsArgs: string[] = []
    let disableWorkspaceTrustArg: string[] = []

    if (params.suite === 'integration' || params.suite === 'e2e') {
        disableExtensionsArgs = await getCliArgsToDisableExtensions(params.vsCodeExecutablePath, {
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
        disableWorkspaceTrustArg = [disableWorkspaceTrust]
    } else {
        disableExtensionsArgs = ['--disable-extensions']
    }

    const workspacePath = join(projectRootDir, 'dist', 'src', 'testFixtures', 'workspaceFolder')
    // This tells VS Code to run the extension in a web environment, which mimics vscode.dev
    const webExtensionKind = params.suite === 'web' ? ['--extensionDevelopmentKind=web'] : []

    return {
        vscodeExecutablePath: params.vsCodeExecutablePath,
        extensionDevelopmentPath: projectRootDir,

        extensionTestsPath: resolve(projectRootDir, params.relativeTestEntryPoint),
        // For verbose VSCode logs, add "--verbose --log debug". c2165cf48e62c
        launchArgs: [...disableExtensionsArgs, workspacePath, ...disableWorkspaceTrustArg, ...webExtensionKind],
        extensionTestsEnv: {
            ['DEVELOPMENT_PATH']: projectRootDir,
            ['AWS_TOOLKIT_AUTOMATION']: params.suite,
            ['TEST_DIR']: process.env.TEST_DIR,
            ...params.env,
        },
    }
}

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
async function setupVSCodeTestInstance(suite: SuiteName): Promise<string> {
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

    // Only certain test suites require specific vscode extensions to be installed
    if (suite === 'e2e' || suite === 'integration') {
        await installVSCodeExtension(vsCodeExecutablePath, VSCODE_EXTENSION_ID.python)
        await installVSCodeExtension(vsCodeExecutablePath, VSCODE_EXTENSION_ID.yaml)
        await installVSCodeExtension(vsCodeExecutablePath, VSCODE_EXTENSION_ID.go)
        await installVSCodeExtension(vsCodeExecutablePath, VSCODE_EXTENSION_ID.java)
        await installVSCodeExtension(vsCodeExecutablePath, VSCODE_EXTENSION_ID.javadebug)
    }

    console.log('VS Code Test instance has been set up')
    return vsCodeExecutablePath
}

async function invokeVSCodeCli(vsCodeExecutablePath: string, args: string[]): Promise<string> {
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

async function installVSCodeExtension(vsCodeExecutablePath: string, extensionIdentifier: string): Promise<void> {
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
async function getCliArgsToDisableExtensions(
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

function getMinVsCodeVersion(): string {
    const vsCodeVersion = packageJson.engines.vscode

    // We assume that we specify a minium, so it matches ^<number>, so remove ^'s
    const sanitizedVersion = vsCodeVersion.replace('^', '')
    console.log(`Using minimum VSCode version specified in package.json: ${sanitizedVersion}`)
    return sanitizedVersion
}
