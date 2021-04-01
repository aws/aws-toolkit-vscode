/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { GoDebugConfiguration } from '../../../lambda/local/debugConfiguration'
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

/**
 * Launches and attaches debugger to a SAM Go project.
 */
export async function invokeGoLambda(ctx: ExtContext, config: GoDebugConfiguration): Promise<GoDebugConfiguration> {
    config.samLocalInvokeCommand = new DefaultSamLocalInvokeCommand([WAIT_FOR_DEBUGGER_MESSAGES.GO_DELVE])
    // eslint-disable-next-line @typescript-eslint/unbound-method
    config.onWillAttachDebugger = goToSleep

    if (!config.noDebug) {
        installDebugger(config.debuggerPath!)
    }

    const c = (await invokeLambdaFunction(ctx, config, async () => {})) as GoDebugConfiguration
    return c
}

/**
 * Triggered before the debugger attachment process begins. We should verify that the debugger is ready to go
 * before returning. We'll wait a little bit before checking ports, just to make sure the debugger doesn't break.
 *
 * @param debugPort Port to check for activity
 * @param timeout Cancellation token to prevent stalling
 */
async function goToSleep(debugPort: number, timeout: Timeout) {
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

    config.codeRoot = pathutil.normalize(config.codeRoot)
    // TODO: install debugger in a temporary work directory instead of the project directory
    config.debuggerPath = path.resolve(config.codeRoot, '.godbg')

    // Always generate a temporary template.yaml, don't use workspace one directly.
    config.templatePath = await makeInputTemplate(config)

    // TODO: make sure debugging works with Go images
    //const isImageLambda = isImageLambdaConfig(config)

    // TODO: add support for GOPATH and GOROOT??

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
        port: config.debugPort ?? -1,
        skipFiles: [],
        debugArgs: ['-delveAPI=2'],
    }

    return goLaunchConfig
}

/**
 * @param debuggerPath Installation path for the debugger
 * @returns A simple shell script for building delve
 */
function makeInstallScript(debuggerPath: string, isWindows: boolean): string {
    let script: string = ''
    const DELVE_MODULE: string = path.normalize('github.com/go-delve/delve/cmd/dlv')
    debuggerPath = path.join(debuggerPath, 'dlv')

    if (isWindows) {
        script += 'set GOPROXY=direct\n'
    } else {
        script += 'export GOPROXY=direct\n'
    }

    script += `go get ${DELVE_MODULE}\n`
    script += `GOARCH=amd64 GOOS=linux go build -o "${debuggerPath}" "${DELVE_MODULE}"\n`

    return script
}

/**
 * Downloads and builds the delve debugger for our container image
 *
 * @param debuggerPath Installation path for the debugger
 */
async function installDebugger(debuggerPath: string): Promise<void> {
    const isWindows: boolean = os.platform() === 'win32'
    const scriptExt: string = isWindows ? 'cmd' : 'sh'
    const installScriptPath: string = path.join(debuggerPath, `install.${scriptExt}`)

    await ensureDir(debuggerPath)
    writeFile(installScriptPath, makeInstallScript(debuggerPath, isWindows), 'utf8')
    await chmod(installScriptPath, 0o700)
    const childProcess = new ChildProcess(path.join(debuggerPath, `install.${scriptExt}`))
    await childProcess.run()

    getLogger().verbose('Installed delve debugger')
}
