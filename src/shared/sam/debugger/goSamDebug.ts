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
import { invokeLambdaFunction, makeInputTemplate, waitForPort } from '../localLambdaRunner'
import { SamLaunchRequestArgs } from './awsSamDebugger'
import { getLogger } from '../../logger'
import { chmod, ensureDir, writeFile } from 'fs-extra'
import { ChildProcess } from '../../utilities/childProcess'
import { Timeout } from '../../utilities/timeoutUtils'
import { SystemUtilities } from '../../../shared/systemUtilities'

/**
 * Launches and attaches debugger to a SAM Go project.
 */
export async function invokeGoLambda(ctx: ExtContext, config: GoDebugConfiguration): Promise<GoDebugConfiguration> {
    config.samLocalInvokeCommand = new DefaultSamLocalInvokeCommand([WAIT_FOR_DEBUGGER_MESSAGES.GO_DELVE])
    // eslint-disable-next-line @typescript-eslint/unbound-method
    config.onWillAttachDebugger = waitForDelve

    if (!config.noDebug) {
        installDebugger(config.debuggerPath!)
    }

    const c = (await invokeLambdaFunction(ctx, config, async () => {})) as GoDebugConfiguration
    return c
}

/**
 * Triggered before the debugger attachment process begins. We should verify that the debugger is ready to go
 * before returning. Checking the ports before Delve has initialized causes it to fail, so an arbitrary delay
 * time is added to reduce the chance of this occuring.
 *
 * @param debugPort Port to check for activity
 * @param timeout Cancellation token to prevent stalling
 */
async function waitForDelve(debugPort: number, timeout: Timeout) {
    await new Promise<void>(resolve => setTimeout(resolve, 1000))
    await waitForPort(debugPort, timeout)
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
    config.debuggerPath = GO_DEBUGGER_PATH

    // Always generate a temporary template.yaml, don't use workspace one directly.
    config.templatePath = await makeInputTemplate(config)

    const isImageLambda = isImageLambdaConfig(config)

    if (isImageLambda && !config.noDebug) {
        config.containerEnvVars = {
            _AWS_LAMBDA_GO_DEBUGGING: '1',
            _AWS_LAMBDA_GO_DELVE_API_VERSION: '2',
            _AWS_LAMBDA_GO_DELVE_PATH: path.join(GO_DEBUGGER_PATH, 'dlv'),
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

/**
 * @param debuggerPath Installation path for the debugger
 * @param isWindows Flag for making a windows script
 * @param forceDirect Sets GOPROXY to direct to prevent DNS failures, for use in tests *only*. See https://golang.org/ref/mod#module-proxy
 * @returns Path for the debugger install script
 */
async function makeInstallScript(debuggerPath: string, isWindows: boolean, forceDirect: boolean): Promise<string> {
    let script: string = ''
    const DELVE_MODULE: string = path.normalize('github.com/go-delve/delve/cmd/dlv')
    const scriptExt: string = isWindows ? 'cmd' : 'sh'
    const installScriptPath: string = path.join(debuggerPath, `install.${scriptExt}`)
    const delvePath: string = path.join(debuggerPath, 'dlv')

    // TODO: don't just check if the file exists, ideally we should check for a version too
    const alreadyInstalled = await SystemUtilities.fileExists(installScriptPath)

    if (alreadyInstalled) {
        return installScriptPath
    }

    // This needs to be done only for internal systems, otherwise leave 'forceDirect' false!
    if (forceDirect) {
        if (isWindows) {
            script += 'set GOPROXY=direct\n'
        } else {
            script += 'export GOPROXY=direct\n'
        }
    }

    script += `go get ${DELVE_MODULE}\n`
    script += `GOARCH=amd64 GOOS=linux go build -o "${delvePath}" "${DELVE_MODULE}"\n`

    await writeFile(installScriptPath, script, 'utf8')
    await chmod(installScriptPath, 0o700)

    return installScriptPath
}

/**
 * Downloads and builds the delve debugger for our container
 *
 * @param debuggerPath Installation path for the debugger
 */
async function installDebugger(debuggerPath: string): Promise<void> {
    await ensureDir(debuggerPath)

    const isWindows: boolean = os.platform() === 'win32'
    const installScriptPath: string = await makeInstallScript(debuggerPath, isWindows, false)

    const childProcess = new ChildProcess(false, installScriptPath)
    await childProcess.run()

    getLogger().debug('Installed delve debugger')
}
