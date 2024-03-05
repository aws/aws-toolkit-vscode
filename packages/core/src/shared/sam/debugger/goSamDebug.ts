/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { GoDebugConfiguration, goDebuggerPath, isImageLambdaConfig } from '../../../lambda/local/debugConfiguration'
import { RuntimeFamily } from '../../../lambda/models/samLambdaRuntime'
import * as pathutil from '../../../shared/utilities/pathUtils'
import { ExtContext } from '../../extensions'
import { findParentProjectFile } from '../../utilities/workspaceUtils'
import { DefaultSamLocalInvokeCommand, waitForDebuggerMessages } from '../cli/samCliLocalInvoke'
import { runLambdaFunction } from '../localLambdaRunner'
import { SamLaunchRequestArgs } from './awsSamDebugger'
import { getLogger } from '../../logger'
import * as fs from 'fs-extra'
import { ChildProcess } from '../../utilities/childProcess'
import { Timeout } from '../../utilities/timeoutUtils'
import { SystemUtilities } from '../../../shared/systemUtilities'
import { execFileSync, SpawnOptions } from 'child_process'
import * as nls from 'vscode-nls'
import { sleep } from '../../utilities/timeoutUtils'
import globals from '../../extensionGlobals'
import { ToolkitError } from '../../errors'
const localize = nls.loadMessageBundle()

/**
 * Launches and attaches debugger to a SAM Go project. A general overview of the program flow:
 * 1. We cross-compile a Delve binary for the container using Delve's source, either from the user's
 *    GOPATH or using 'go get'. The binary is placed in the extension's global storage path with
 *    path 'debuggers/delve/dlv'
 * 3. SAM CLI will then mount the 'delve' directory to '/tmp/lambci_debug'. We use --debugger-path
 *    to specify which directory to mount. SAM CLI will always look for 'dlv', so the binary must
 *    be compiled with that name.
 * 4. The generate configuration options are passed along to SAM build + SAM invoke which will
 *    compile the handler using the path specified by 'codeRoot'. The handler entry point must be
 *    a direct child of 'codeRoot', otherwise it will fail to build. Builds are done by a sub-module
 *    of SAM CLI [1]. SAM invoke then mounts the build-artifact directory as '/var/task/[HandlerName]'
 * 5. Something called the 'Runtime Interface Emulator' is started in the container, which then
 *    starts an intermediate program [2] that starts the Delve debugger in 'headless exec' mode.
 *    The handler is finally executed by Delve. We can now communicate with Delve using the Go
 *    extension's debug adapter client.
 * 6. All paths communicated by Delve will be absolute from the moment it was compiled. So any
 *    kind of path mappings are unncessary as long as the binary is compiled directly from source.
 *    In other words, don't build the binary from a copy of the source.
 *
 * References:
 *  [1] https://github.com/aws/aws-lambda-builders/blob/b663326079c871e50f1545f36f9695f6958cfaa2/aws_lambda_builders/workflows/go_modules/builder.py
 *  [2] https://github.com/lambci/docker-lambda/blob/f6b4765a9b659ceb949c34b19390026820ddd462/go1.x/run/aws-lambda-mock.go
 */
export async function invokeGoLambda(ctx: ExtContext, config: GoDebugConfiguration): Promise<GoDebugConfiguration> {
    config.samLocalInvokeCommand = new DefaultSamLocalInvokeCommand([waitForDebuggerMessages.GO_DELVE])
    // eslint-disable-next-line @typescript-eslint/unbound-method
    config.onWillAttachDebugger = waitForDelve

    if (!config.noDebug && !(await installDebugger(config.debuggerPath!))) {
        throw new ToolkitError(
            localize('AWS.sam.debugger.godelve.failed', 'Failed to install Delve for the lambda container.'),
            {
                code: 'NoDelveInstallation',
            }
        )
    }

    const c = (await runLambdaFunction(ctx, config, async () => {})) as GoDebugConfiguration
    return c
}

/**
 * Triggered before the debugger attachment process begins. We should verify that the debugger is ready to go
 * before returning. The Delve DAP will only accept a single client, so checking if the ports are in use will
 * cause Delve to terminate.
 *
 * @param debugPort Port to check for activity
 * @param timeout Cancellation token to prevent stalling
 */
async function waitForDelve(debugPort: number, timeout: Timeout) {
    await sleep(1000)
}

export async function getSamProjectDirPathForFile(filepath: string): Promise<string> {
    const modulePath = await findParentProjectFile(vscode.Uri.parse(filepath), /^go\.mod$/)
    if (!modulePath) {
        throw new Error(`Cannot find go.mod for: ${filepath}`)
    }

    return path.dirname(modulePath.fsPath)
}

/**
 * Gathers and sets launch-config info by inspecting the workspace and creating
 * temp files/directories as needed.
 *
 * Does NOT execute/invoke SAM, docker, etc.
 */
export async function makeGoConfig(config: SamLaunchRequestArgs): Promise<GoDebugConfiguration> {
    if (!config.baseBuildDir) {
        throw Error('invalid state: config.baseBuildDir was not set')
    }

    config.codeRoot =
        config.codeRoot ??
        pathutil.normalize(await getSamProjectDirPathForFile(config?.templatePath ?? config.documentUri!.fsPath))

    if (!config.codeRoot) {
        throw Error('missing launch.json, template.yaml, and failed to discover project root')
    }

    const port: number = config.debugPort ?? -1

    config.codeRoot = pathutil.normalize(config.codeRoot)

    // We want to persist the binary we build since it takes a non-trivial amount of time to build
    config.debuggerPath = path.join(globals.context.globalStorageUri.fsPath, 'debuggers', 'delve')

    const isImageLambda = await isImageLambdaConfig(config)

    // Reference: https://github.com/aws/aws-sam-cli/blob/4543732bf3c0da3b57fe1e5aa43ce3f41d2bd0ba/samcli/local/docker/lambda_debug_settings.py#L94-L103
    // These are the default settings. For some reason SAM CLI is not setting them even if the container
    // environment file does not exist. SAM CLI will skip the debugging step if these are not set!
    if (isImageLambda && !config.noDebug) {
        config.containerEnvVars = {
            _AWS_LAMBDA_GO_DEBUGGING: '1',
            _AWS_LAMBDA_GO_DELVE_API_VERSION: '2',
            _AWS_LAMBDA_GO_DELVE_PATH: path.posix.join(goDebuggerPath, 'dlv'),
            _AWS_LAMBDA_GO_DELVE_LISTEN_PORT: port.toString(),
        }
    }

    // Make a go launch-config from the generic config.
    const goLaunchConfig: GoDebugConfiguration = {
        ...config, // Compose.
        type: 'go',
        processName: 'godelve',
        request: 'attach',
        mode: config.noDebug ? undefined : 'remote',
        runtimeFamily: RuntimeFamily.Go,
        preLaunchTask: undefined,
        host: 'localhost',
        port: port,
        skipFiles: [],
        debugArgs: isImageLambda || config.noDebug ? undefined : ['-delveAPI=2'],
        debugAdapter: 'legacy', // Just in case the Go extension decides to make Delve DAP the default
    }

    return goLaunchConfig
}

interface InstallScript {
    path: string
    options?: SpawnOptions
}

/**
 * We want to cross-compile Delve using the version currently installed by the user. Git is used to check for the current
 * version by locating the package directory in the user's GOPATH. We append this version to an install script, so we know
 * in the future if we already built it.
 *
 * @param debuggerPath Installation path for the debugger
 * @param isWindows Flag for making a windows script
 * @returns Path for the debugger install script, undefined if we already built the binary
 */
async function makeInstallScript(debuggerPath: string, isWindows: boolean): Promise<InstallScript | undefined> {
    let script: string = isWindows ? '' : '#!/bin/sh\n'
    const delveRepo: string = 'github.com/go-delve/delve'
    const scriptExt: string = isWindows ? 'cmd' : 'sh'
    const delvePath: string = path.posix.join(debuggerPath, 'dlv')
    const installOptions: SpawnOptions = { env: { ...process.env } }
    let delveVersion: string = ''

    // Since Go1.16, GO111MODULE is on by default. This causes Go to require the
    // existence of a go.mod file or else it gives up. GO111MODULE=off prevents
    // Go from trying to find the manifest file and uses GOPATH provided below.
    installOptions.env!['GO111MODULE'] = 'off'

    function getDelveVersion(repo: string, silent: boolean): string {
        try {
            return execFileSync('git', ['-C', repo, 'describe', '--tags', '--abbrev=0']).toString().trim()
        } catch (e) {
            if (!silent) {
                throw e
            }
            return ''
        }
    }

    // It's fine if we can't get the latest Delve version, the Toolkit will use the last built one instead
    try {
        const goPath: string = JSON.parse(execFileSync('go', ['env', '-json']).toString()).GOPATH
        let repoPath: string = path.join(goPath, 'src', delveRepo)

        if (!getDelveVersion(repoPath, true)) {
            getLogger('channel').info(
                localize(
                    'AWS.sam.debugger.godelve.download',
                    'The Delve repo was not found in your GOPATH. Downloading in a temporary directory...'
                )
            )
            installOptions.env!['GOPATH'] = debuggerPath
            repoPath = path.join(debuggerPath, 'src', delveRepo)
            const args = ['get', '-d', `${delveRepo}/cmd/dlv`]
            const out = execFileSync('go', args, installOptions as any)
            getLogger().debug('"go %O": %s', args, out)
        }

        delveVersion = getDelveVersion(repoPath, false)
    } catch (e) {
        getLogger().debug('Failed to get latest Delve version: %O', e as Error)
    }

    delveVersion = delveVersion.replace('v', '-')
    const installScriptPath: string = path.join(debuggerPath, `install${delveVersion}.${scriptExt}`)
    const alreadyInstalled = await SystemUtilities.fileExists(installScriptPath)

    if (alreadyInstalled && delveVersion !== '') {
        return undefined
    }

    installOptions.env!['GOARCH'] = 'amd64'
    installOptions.env!['GOOS'] = 'linux'

    script += `go build -o "${delvePath}" "${delveRepo}/cmd/dlv"\n`

    await fs.writeFile(installScriptPath, script, 'utf8')
    await fs.chmod(installScriptPath, 0o755)

    return { path: installScriptPath, options: installOptions }
}

/**
 * Downloads and builds the delve debugger for our container
 *
 * @param debuggerPath Installation path for the debugger
 * @returns False when installation fails
 */
async function installDebugger(debuggerPath: string): Promise<boolean> {
    await fs.ensureDir(debuggerPath)
    const isWindows: boolean = os.platform() === 'win32'
    let installScript: InstallScript | undefined

    try {
        installScript = await makeInstallScript(debuggerPath, isWindows)

        if (!installScript) {
            return true
        }

        const childProcess = new ChildProcess(installScript.path, [], { spawnOptions: installScript.options })
        const install = await childProcess.run({
            onStdout: (text: string) => getLogger('channel').info(`[Delve install script] -> ${text}`),
            onStderr: (text: string) => getLogger('channel').error(`[Delve install script] -> ${text}`),
        })

        const code = install.exitCode
        if (!fs.existsSync(path.join(debuggerPath, 'dlv'))) {
            throw new Error(`Install script did not generate the Delve binary: exit code ${code}`)
        } else if (code) {
            getLogger('channel').warn(`Install script did not sucessfully run, using old Delve binary...`)
        } else {
            getLogger().info(`Installed Delve debugger in ${debuggerPath}`)
        }
    } catch (e) {
        if (installScript && (await SystemUtilities.fileExists(installScript.path))) {
            fs.unlinkSync(installScript.path) // Removes the install script since it failed
        }
        getLogger().error('Failed to cross-compile Delve debugger: %O', e as Error)
        return false
    }

    return true
}
