/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFileSync } from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import { isImageLambdaConfig, NodejsDebugConfiguration } from '../../../lambda/local/debugConfiguration'
import { RuntimeFamily } from '../../../lambda/models/samLambdaRuntime'
import * as systemutil from '../../../shared/systemUtilities'
import { ChildProcess } from '../../../shared/utilities/childProcess'
import * as pathutil from '../../../shared/utilities/pathUtils'
import { ExtContext } from '../../extensions'
import { getLogger } from '../../logger'
import { findParentProjectFile } from '../../utilities/workspaceUtils'
import { DefaultSamLocalInvokeCommand, waitForDebuggerMessages } from '../cli/samCliLocalInvoke'
import { runLambdaFunction, waitForPort } from '../localLambdaRunner'
import { SamLaunchRequestArgs } from './awsSamDebugger'

/**
 * Launches and attaches debugger to a SAM Node project.
 */
export async function invokeTypescriptLambda(
    ctx: ExtContext,
    config: NodejsDebugConfiguration
): Promise<NodejsDebugConfiguration> {
    config.samLocalInvokeCommand = new DefaultSamLocalInvokeCommand([waitForDebuggerMessages.NODEJS])
    // eslint-disable-next-line @typescript-eslint/unbound-method
    config.onWillAttachDebugger = waitForPort

    const onAfterBuild = () => compileTypeScript(config)
    const c = (await runLambdaFunction(ctx, config, onAfterBuild)) as NodejsDebugConfiguration
    return c
}

export async function getSamProjectDirPathForFile(filepath: string): Promise<string> {
    const packageJsonPath = await findParentProjectFile(vscode.Uri.parse(filepath), /^package\.json$/)
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
    if (!config.baseBuildDir) {
        throw Error('invalid state: config.baseBuildDir was not set')
    }
    if (!config.codeRoot) {
        // Last-resort attempt to discover the project root (when there is no
        // `launch.json` nor `template.yaml`).
        config.codeRoot = pathutil.normalize(
            await getSamProjectDirPathForFile(config?.templatePath ?? config.documentUri!.fsPath)
        )
        if (!config.codeRoot) {
            // TODO: return error and show it at the caller.
            throw Error('missing launch.json, template.yaml, and failed to discover project root')
        }
    }
    let localRoot: string | undefined
    let remoteRoot: string | undefined
    config.codeRoot = pathutil.normalize(config.codeRoot)

    const isImageLambda = isImageLambdaConfig(config)

    if (isImageLambda && !config.noDebug) {
        config.containerEnvVars = {
            NODE_OPTIONS: `--inspect-brk=0.0.0.0:${config.debugPort} --max-http-header-size 81920`,
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

    //  Make a node launch-config from the generic config.
    const nodejsLaunchConfig: NodejsDebugConfiguration = {
        ...config, // Compose.
        type: 'node',
        request: config.noDebug ? 'launch' : 'attach',
        runtimeFamily: RuntimeFamily.NodeJS,
        preLaunchTask: undefined,
        address: 'localhost',
        port: config.debugPort ?? -1,
        // in theory, roots should never be undefined for node
        localRoot: localRoot ?? config.codeRoot,
        remoteRoot: remoteRoot ?? '/var/task',
        protocol: 'inspector',
        // Stop at first user breakpoint, not the runtime bootstrap file.
        stopOnEntry: config.stopOnEntry === undefined ? false : !!config.stopOnEntry,
        skipFiles: ['/var/runtime/node_modules/**/*.js', '<node_internals>/**/*.js'],
    }

    return nodejsLaunchConfig
}

/**
 * Compiles non-template (target=code) debug configs, using a temporary default
 * tsconfig.json file.
 *
 * Assumes that `sam build` was already performed.
 */
async function compileTypeScript(config: NodejsDebugConfiguration): Promise<void> {
    if (!config.baseBuildDir) {
        throw Error('invalid state: config.baseBuildDir was not set')
    }
    if (config.invokeTarget.target !== 'code') {
        return
    }

    async function findTsOrTsConfig(dir: string, child: boolean): Promise<string | undefined> {
        const glob = (child ? '*/' : '') + '{*.ts,tsconfig.json}'
        const found = await vscode.workspace.findFiles(new vscode.RelativePattern(dir, glob), '**/node_modules/**', 1)
        if (found.length === 0) {
            return undefined
        }
        return found[0].fsPath
    }

    // Require tsconfig.json or *.ts in the top-level of the source app, to
    // indicate a typescript Lambda. #2086
    // Note: we don't use this tsconfig.json for compiling the target=code
    // Lambda app below, instead we generate a minimal one.
    const isTsApp = (await findTsOrTsConfig(config.codeRoot, false)) !== undefined
    if (!isTsApp) {
        return
    }

    const buildOutputDir = path.join(config.baseBuildDir, 'output')
    const buildDirTsFile = await findTsOrTsConfig(buildOutputDir, true)
    if (!buildDirTsFile) {
        // Should never happen: `sam build` should have copied the tsconfig.json from the source app dir.
        throw new Error(`tsconfig.json or *.ts not found in: "${buildOutputDir}/*"`)
    }
    // XXX: `sam` may rename the CodeUri (and thus "output/<app>/" dir) if the
    // original "<app>/" dir contains special chars, so get it this way. #2086
    const buildDirApp = path.dirname(buildDirTsFile)
    const buildDirTsConfig = path.join(buildDirApp, 'tsconfig.json')

    const tsc = await systemutil.SystemUtilities.findTypescriptCompiler()
    if (!tsc) {
        throw new Error('TypeScript compiler "tsc" not found in node_modules/ or the system.')
    }

    // Default config.
    // Adapted from: https://github.com/aws/aws-toolkit-jetbrains/blob/911c54252d6a4271ee6cacf0ea1023506c4b504a/jetbrains-ultimate/src/software/aws/toolkits/jetbrains/services/lambda/nodejs/NodeJsLambdaBuilder.kt#L60
    const defaultTsconfig = {
        compilerOptions: {
            target: 'es6',
            module: 'commonjs',
            typeRoots: ['node_modules/@types'],
            types: ['node'],
            rootDir: '.',
            inlineSourceMap: true,
        },
    }
    try {
        // Overwrite the tsconfig.json copied by `sam build`.
        writeFileSync(buildDirTsConfig, JSON.stringify(defaultTsconfig, undefined, 4))
        getLogger('channel').info(`Compiling TypeScript app with: "${tsc}"`)
        await new ChildProcess(tsc, ['--project', buildDirApp]).run()
    } catch (error) {
        getLogger('channel').error(`TypeScript compile error: ${error}`)
        throw Error('Failed to compile TypeScript app')
    }
}
