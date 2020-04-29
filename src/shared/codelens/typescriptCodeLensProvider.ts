/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { LambdaHandlerCandidate, RootlessLambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { normalizeSeparator } from '../utilities/pathUtils'
import {
    executeSamBuild,
    generateInputTemplate,
    waitForDebugPort,
    makeBuildDir,
    invokeLambdaFunction,
} from './localLambdaRunner'
import { ExtContext } from '../extensions'
import { NodejsDebugConfiguration } from '../../lambda/local/debugConfiguration'
import { DefaultSamLocalInvokeCommand, WAIT_FOR_DEBUGGER_MESSAGES } from '../sam/cli/samCliLocalInvoke'
import { DefaultValidatingSamCliProcessInvoker } from '../sam/cli/defaultValidatingSamCliProcessInvoker'
import { SamLaunchRequestArgs } from '../sam/debugger/samDebugSession'
import { RuntimeFamily } from '../../lambda/models/samLambdaRuntime'
import * as pathutil from '../../shared/utilities/pathUtils'
import { findParentProjectFile } from '../utilities/workspaceUtils'
import { TypescriptLambdaHandlerSearch } from '../typescriptLambdaHandlerSearch'

export async function getSamProjectDirPathForFile(filepath: string): Promise<string> {
    const packageJsonPath = await findParentProjectFile(vscode.Uri.parse(filepath), 'package.json')
    if (!packageJsonPath) {
        throw new Error(`Cannot find package.json for: ${filepath}`)
    }

    return path.dirname(packageJsonPath.fsPath)
}

export async function getLambdaHandlerCandidates(document: vscode.TextDocument): Promise<LambdaHandlerCandidate[]> {
    const packageJsonFile = await findParentProjectFile(document.uri, 'package.json')

    if (!packageJsonFile) {
        return []
    }

    const search: TypescriptLambdaHandlerSearch = new TypescriptLambdaHandlerSearch(
        document.uri.fsPath,
        document.getText()
    )
    const unprocessedHandlers: RootlessLambdaHandlerCandidate[] = await search.findCandidateLambdaHandlers()

    // For Javascript CodeLenses, store the complete relative pathed handler name
    // (eg: src/app.handler) instead of only the pure handler name (eg: app.handler)
    // Without this, the CodeLens command is unable to resolve a match back to a sam template.
    // This is done to address https://github.com/aws/aws-toolkit-vscode/issues/757
    return await finalizeTsHandlers(unprocessedHandlers, document.uri, packageJsonFile)
}

/**
 * Applies a full relative path to the Javascript handler that will be stored in the CodeLens commands.
 * Also adds `package.json` path
 * @param handlers Rootless handlers to apply relative paths to
 * @param uri URI of the file containing these Lambda Handlers
 * @param packageJsonFileUri URI of `package.json` file
 */
async function finalizeTsHandlers(
    handlers: RootlessLambdaHandlerCandidate[],
    fileUri: vscode.Uri,
    packageJsonFileUri: vscode.Uri
): Promise<LambdaHandlerCandidate[]> {
    const relativePath = path.relative(path.dirname(packageJsonFileUri.fsPath), path.dirname(fileUri.fsPath))

    return handlers.map(handler => {
        return {
            filename: handler.filename,
            handlerName: normalizeSeparator(path.join(relativePath, handler.handlerName)),
            manifestUri: packageJsonFileUri,
            range: handler.range,
        }
    })
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
    config.samTemplatePath = pathutil.normalize(await generateInputTemplate(config))

    //  Make a python launch-config from the generic config.
    const nodejsLaunchConfig: NodejsDebugConfiguration = {
        ...config, // Compose.
        type: 'node',
        request: 'attach',
        runtimeFamily: RuntimeFamily.NodeJS,
        name: 'SamLocalDebug',
        preLaunchTask: undefined,
        address: 'localhost',
        port: config.debugPort!!,
        localRoot: config.codeRoot,
        remoteRoot: '/var/task',
        protocol: 'inspector',
        skipFiles: ['/var/runtime/node_modules/**/*.js', '<node_internals>/**/*.js'],
    }

    return nodejsLaunchConfig
}

/**
 * Launches and attaches debugger to a SAM Node project.
 */
export async function invokeTypescriptLambda(ctx: ExtContext, config: NodejsDebugConfiguration) {
    // Switch over to the output channel so the user has feedback that we're getting things ready
    ctx.chanLogger.channel.show(true)
    ctx.chanLogger.info('AWS.output.sam.local.start', 'Preparing to run {0} locally...', config.handlerName)

    const processInvoker = new DefaultValidatingSamCliProcessInvoker({})
    config.samLocalInvokeCommand = new DefaultSamLocalInvokeCommand(ctx.chanLogger, [WAIT_FOR_DEBUGGER_MESSAGES.NODEJS])

    // XXX: reassignment
    config.samTemplatePath = await executeSamBuild({
        baseBuildDir: config.baseBuildDir!!,
        channelLogger: ctx.chanLogger,
        codeDir: config.codeRoot,
        inputTemplatePath: config.samTemplatePath,
        samProcessInvoker: processInvoker,
        useContainer: config.sam?.containerBuild,
    })
    if (config.invokeTarget.target === 'template') {
        // XXX: reassignment
        config.invokeTarget.samTemplatePath = config.samTemplatePath
    }

    ctx.chanLogger.info(
        'AWS.output.starting.sam.app.locally',
        'Starting the SAM Application locally (see Terminal for output)'
    )

    config.onWillAttachDebugger = waitForDebugPort

    await invokeLambdaFunction(ctx, config)
}
