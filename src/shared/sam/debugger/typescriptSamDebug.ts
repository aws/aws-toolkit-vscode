/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { NodejsDebugConfiguration } from '../../../lambda/local/debugConfiguration'
import { RuntimeFamily } from '../../../lambda/models/samLambdaRuntime'
import * as pathutil from '../../../shared/utilities/pathUtils'
import { ExtContext } from '../../extensions'
import { SamLaunchRequestArgs } from '../../sam/debugger/samDebugSession'
import { findParentProjectFile } from '../../utilities/workspaceUtils'
import { DefaultSamLocalInvokeCommand, WAIT_FOR_DEBUGGER_MESSAGES } from '../cli/samCliLocalInvoke'
import { invokeLambdaFunction, makeBuildDir, makeInputTemplate, waitForDebugPort } from '../localLambdaRunner'

/**
 * Launches and attaches debugger to a SAM Node project.
 */
export async function invokeTypescriptLambda(ctx: ExtContext, config: NodejsDebugConfiguration) {
    config.samLocalInvokeCommand = new DefaultSamLocalInvokeCommand(ctx.chanLogger, [WAIT_FOR_DEBUGGER_MESSAGES.NODEJS])
    config.onWillAttachDebugger = waitForDebugPort
    await invokeLambdaFunction(ctx, config, async () => {})
}

export async function getSamProjectDirPathForFile(filepath: string): Promise<string> {
    const packageJsonPath = await findParentProjectFile(vscode.Uri.parse(filepath), 'package.json')
    if (!packageJsonPath) {
        throw new Error(`Cannot find package.json for: ${filepath}`)
    }

    return path.dirname(packageJsonPath.fsPath)
}

/**
 * Gathers and sets launch-config info by inspecting the workspace and creating
 * temp files/directories as needed.
 *
 * Does NOT execute/invoke SAM, docker, etc.
 */
export async function makeTypescriptConfig(config: SamLaunchRequestArgs): Promise<NodejsDebugConfiguration> {
    if (!config.codeRoot) {
        // Last-resort attempt to discover the project root (when there is no
        // `launch.json` nor `template.yaml`).
        config.codeRoot = pathutil.normalize(
            await getSamProjectDirPathForFile(config?.samTemplatePath ?? config.documentUri!!.fsPath)
        )
        if (!config.codeRoot) {
            // TODO: return error and show it at the caller.
            throw Error('missing launch.json, template.yaml, and failed to discover project root')
        }
    }
    config.codeRoot = pathutil.normalize(config.codeRoot)

    config.baseBuildDir = await makeBuildDir()

    // Always generate a temporary template.yaml, don't use workspace one directly.
    config.samTemplatePath = await makeInputTemplate(config)

    //  Make a python launch-config from the generic config.
    const nodejsLaunchConfig: NodejsDebugConfiguration = {
        ...config, // Compose.
        type: 'node',
        request: config.noDebug ? 'launch' : 'attach',
        runtimeFamily: RuntimeFamily.NodeJS,
        name: 'SamLocalDebug',
        preLaunchTask: undefined,
        address: 'localhost',
        port: config.debugPort ?? -1,
        localRoot: config.codeRoot,
        remoteRoot: '/var/task',
        protocol: 'inspector',
        skipFiles: ['/var/runtime/node_modules/**/*.js', '<node_internals>/**/*.js'],
    }

    return nodejsLaunchConfig
}
