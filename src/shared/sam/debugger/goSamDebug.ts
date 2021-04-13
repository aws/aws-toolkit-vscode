/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { GoDebugConfiguration, GO_DEBUGGER_PATH, isImageLambdaConfig } from '../../../lambda/local/debugConfiguration'
import { RuntimeFamily } from '../../../lambda/models/samLambdaRuntime'
import * as pathutil from '../../../shared/utilities/pathUtils'
import { ExtContext } from '../../extensions'
import { findParentProjectFile } from '../../utilities/workspaceUtils'
import { DefaultSamLocalInvokeCommand, WAIT_FOR_DEBUGGER_MESSAGES } from '../cli/samCliLocalInvoke'
import { invokeLambdaFunction, makeInputTemplate } from '../localLambdaRunner'
import { SamLaunchRequestArgs } from './awsSamDebugger'
import { getLogger } from '../../logger'
import { chmod, ensureDir, writeFile, pathExistsSync, unlinkSync } from 'fs-extra'
import { ChildProcess } from '../../utilities/childProcess'
import { Timeout } from '../../utilities/timeoutUtils'
import { SystemUtilities } from '../../../shared/systemUtilities'
import { execSync, SpawnOptions } from 'child_process'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

/**
 * Launches and attaches debugger to a SAM Go project.
 */
export async function invokeGoLambda(ctx: ExtContext, config: GoDebugConfiguration): Promise<GoDebugConfiguration> {
    config.samLocalInvokeCommand = new DefaultSamLocalInvokeCommand([WAIT_FOR_DEBUGGER_MESSAGES.GO_DELVE])
    // eslint-disable-next-line @typescript-eslint/unbound-method
    config.onWillAttachDebugger = waitForDelve

    if (!config.noDebug && !(await installDebugger(config.debuggerPath!))) {
        getLogger('channel').warn(
            localize('AWS.sam.debugger.godelve.failed', 'Failed to install Delve. Code will execute without debugging.')
        )
        config.noDebug = false
    }

    const c = (await invokeLambdaFunction(ctx, config, async () => {})) as GoDebugConfiguration
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
    await new Promise<void>(resolve => setTimeout(resolve, 1000))
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
        pathutil.normalize(await getSamProjectDirPathForFile(config?.templatePath ?? config.documentUri!!.fsPath))

    if (!config.codeRoot) {
        throw Error('missing launch.json, template.yaml, and failed to discover project root')
    }

    let localRoot: string | undefined
    let remoteRoot: string | undefined
    const port: number = config.debugPort ?? -1

    config.codeRoot = pathutil.normalize(config.codeRoot)

    // We want to persist the binary we build since it takes a non-trivial amount of time to build
    // TODO: revist where to install Delve. Ideally we don't want to clutter the user's workspace
    // with files without an explanation. For now, we will place it in the same location as codeRoot
    // in a .godbg directory.
    config.debuggerPath = path.join(path.dirname(config.codeRoot), '.godbg')

    // Always generate a temporary template.yaml, don't use workspace one directly.
    config.templatePath = await makeInputTemplate(config)

    const isImageLambda = isImageLambdaConfig(config)

    // Reference: https://github.com/aws/aws-sam-cli/blob/4543732bf3c0da3b57fe1e5aa43ce3f41d2bd0ba/samcli/local/docker/lambda_debug_settings.py#L94-L103
    // These are the default settings. For some reason SAM CLI is not setting them even if the container
    // environment file does not exist. SAM CLI will skip the debugging step if these are not set!
    if (isImageLambda && !config.noDebug) {
        config.containerEnvVars = {
            _AWS_LAMBDA_GO_DEBUGGING: '1',
            _AWS_LAMBDA_GO_DELVE_API_VERSION: '2',
            _AWS_LAMBDA_GO_DELVE_PATH: path.posix.join(GO_DEBUGGER_PATH, 'dlv'),
            _AWS_LAMBDA_GO_DELVE_LISTEN_PORT: port.toString(),
        }
    }

    // if provided, use the user's mapping instead
    if (config.lambda?.pathMappings !== undefined && config.lambda.pathMappings.length > 0) {
        const mappings = config.lambda.pathMappings
        if (mappings.length !== 1) {
            getLogger().warn(
                'This language only supports a single path mapping entry. Taking the first entry in the list.'
            )
        }
        localRoot = mappings[0].localRoot
        remoteRoot = mappings[0].remoteRoot
    }

    //  Make a go launch-config from the generic config.
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
        localRoot: localRoot ?? config.codeRoot,
        remoteRoot: remoteRoot ?? '/var/task',
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
 * @param forceDirect Sets GOPROXY to direct to prevent DNS failures, for use in tests *only*. See https://golang.org/ref/mod#module-proxy
 * @returns Path for the debugger install script, undefined if we already built the binary
 */
async function makeInstallScript(
    debuggerPath: string,
    isWindows: boolean,
    forceDirect: boolean
): Promise<InstallScript | undefined> {
    let script: string = ''
    const DELVE_REPO: string = 'github.com/go-delve/delve'
    const scriptExt: string = isWindows ? 'cmd' : 'sh'
    const delvePath: string = path.posix.join(debuggerPath, 'dlv')
    const installOptions: SpawnOptions = { env: { ...process.env } }
    let delveVersion: string = ''

    // This needs to be done only for internal systems, otherwise leave 'forceDirect' false!
    if (forceDirect) {
        installOptions.env!['GOPROXY'] = 'direct'
    }

    // It's fine if we can't get the latest Delve version, the Toolkit will use the last built one instead
    try {
        const goPath: string = JSON.parse(execSync('go env -json').toString()).GOPATH
        let repoPath: string = path.join(goPath, 'src', DELVE_REPO)

        if (!pathExistsSync(repoPath)) {
            getLogger('channel').info(
                localize(
                    'AWS.sam.debugger.godelve.download',
                    'The Delve repo was not found in your GOPATH. Downloading in a temporary directory...'
                )
            )
            installOptions.env!['GOPATH'] = debuggerPath
            repoPath = path.join(debuggerPath, 'src', DELVE_REPO)
            execSync(`go get -d ${DELVE_REPO}/cmd/dlv`, installOptions as any)
        }

        delveVersion = execSync(`cd "${repoPath}" && git describe --tags --abbrev=0`).toString().trim()
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
    installOptions.env!['GO111MODULE'] = 'off'

    script += `go build -o "${delvePath}" "${DELVE_REPO}/cmd/dlv"\n`

    await writeFile(installScriptPath, script, 'utf8')
    await chmod(installScriptPath, 0o755)

    return { path: installScriptPath, options: installOptions }
}

/**
 * Downloads and builds the delve debugger for our container
 *
 * @param debuggerPath Installation path for the debugger
 * @returns False when installation fails
 */
async function installDebugger(debuggerPath: string): Promise<boolean> {
    await ensureDir(debuggerPath)

    const isWindows: boolean = os.platform() === 'win32'
    const installScript = await makeInstallScript(debuggerPath, isWindows, false)

    if (!installScript) {
        return true
    }

    const childProcess = new ChildProcess(true, installScript.path, installScript.options)

    try {
        await childProcess.run()

        if (!(await SystemUtilities.fileExists(path.join(debuggerPath, 'dlv')))) {
            throw new Error('Install script did not generate the Delve binary')
        }

        getLogger().info(`Installed Delve debugger in ${debuggerPath}`)
    } catch (e) {
        unlinkSync(installScript.path) // Removes the install script since it failed
        getLogger().error('Failed to cross-compile Delve debugger: %O', e as Error)
        return false
    }

    return true
}
