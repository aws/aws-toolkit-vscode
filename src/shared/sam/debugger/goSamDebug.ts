/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { isImageLambdaConfig, GoDebugConfiguration } from '../../../lambda/local/debugConfiguration'
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

/**
 * Launches and attaches debugger to a SAM Node project.
 */
export async function invokeGoLambda(ctx: ExtContext, config: GoDebugConfiguration): Promise<GoDebugConfiguration> {
    config.samLocalInvokeCommand = new DefaultSamLocalInvokeCommand([WAIT_FOR_DEBUGGER_MESSAGES.GO_DELVE])
    // eslint-disable-next-line @typescript-eslint/unbound-method
    config.onWillAttachDebugger = waitForPort
    if (!config.noDebug) {
        installDebugger(config.debuggerPath!)
    }
    const c = (await invokeLambdaFunction(ctx, config, async () => {})) as GoDebugConfiguration
    return c
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
    if (!config.codeRoot) {
        // Last-resort attempt to discover the project root
        config.codeRoot = pathutil.normalize(
            await getSamProjectDirPathForFile(config?.templatePath ?? config.documentUri!!.fsPath)
        )
        if (!config.codeRoot) {
            // TODO: return error and show it at the caller.
            throw Error('missing launch.json, template.yaml, and failed to discover project root')
        }
    }
    let localRoot: string | undefined
    let remoteRoot: string | undefined
    config.codeRoot = pathutil.normalize(config.codeRoot)
    config.debuggerPath = path.resolve(config.codeRoot, '.godbg')

    // Always generate a temporary template.yaml, don't use workspace one directly.
    config.templatePath = await makeInputTemplate(config)

    const isImageLambda = isImageLambdaConfig(config)

    /*
    if (isImageLambda && !config.noDebug) {
        config.containerEnvVars = {
            NODE_OPTIONS: `--inspect-brk=0.0.0.0:${config.debugPort} --max-http-header-size 81920`,
        }
    }
    */

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
        request: 'attach',
        mode: config.noDebug ? undefined : 'remote',
        runtimeFamily: RuntimeFamily.Go,
        preLaunchTask: undefined,
        host: 'localhost',
        port: config.debugPort ?? -1,
        // in theory, roots should never be undefined for node
        //localRoot: localRoot ?? config.codeRoot,
        // Stop at first user breakpoint, not the runtime bootstrap file.
        stopOnEntry: config.stopOnEntry === undefined ? false : !!config.stopOnEntry,
        skipFiles: [],
        debugArgs: ['-delveAPI=2'],
    }

    return goLaunchConfig
}

function makeInstallScript(debuggerPath: string): string {
    const DELVE_MODULE: string = 'github.com/go-delve/delve/cmd/dlv'
    const script: string = `
        export GOPROXY=direct
        go get ${DELVE_MODULE}
        GOARCH=amd64 GOOS=linux go build -o ${debuggerPath}/dlv ${DELVE_MODULE}
    `

    return script
}

/**
 * Downloads and builds the delve debugger for our container image
 *
 * @param debuggerPath
 */
async function installDebugger(debuggerPath: string): Promise<void> {
    const installScriptPath = path.join(debuggerPath, 'install.sh')
    await ensureDir(debuggerPath)
    writeFile(installScriptPath, makeInstallScript(debuggerPath), 'utf8')
    await chmod(installScriptPath, 0o700)
    const childProcess = new ChildProcess(path.join(debuggerPath, 'install.sh'))
    await childProcess.run()
    getLogger().info('Installed delve debugger')
}
