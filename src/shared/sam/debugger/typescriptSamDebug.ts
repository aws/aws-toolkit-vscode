/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, PathLike, readFileSync } from 'fs'
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

const tsConfigFile = 'aws-toolkit-tsconfig.json'

// use project tsconfig.json as initial base - if unable to parse existing config
const tsConfigInitialBaseFile = 'tsconfig.json'

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

    const c = (await runLambdaFunction(ctx, config, async () => {})) as NodejsDebugConfiguration
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

    // compile typescript code and convert lambda handler if necessary
    await compileTypeScript(config)

    const isImageLambda = await isImageLambdaConfig(config)

    if (isImageLambda && !config.noDebug) {
        // Need --inspect to enable debugging. SAM CLI doesn't send env vars for "Image" packagetype.
        config.containerEnvVars = {
            NODE_OPTIONS: `--inspect=0.0.0.0:${config.debugPort} --max-http-header-size 81920`,
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
        stopOnEntry: config.stopOnEntry ?? false,
        // See `continueOnAttach` at: https://code.visualstudio.com/docs/nodejs/nodejs-debugging
        // Workaround SAM CLI's outdated settings: https://github.com/aws/aws-sam-cli/blob/1adc080b82476288804c41c553c5e2ad86f28298/samcli/local/docker/lambda_debug_settings.py#L165
        // Not needed (but harmless) for "Image" packagetype: we set "NODE_OPTIONS:--inspect=…" above.
        continueOnAttach: config.continueOnAttach ?? true,
        skipFiles: ['/var/runtime/node_modules/**/*.js', '<node_internals>/**/*.js'],
    }

    return nodejsLaunchConfig
}

/**
 * Compiles non-template (target=code) debug configs, using a temporary default
 * tsconfig.json file.
 *
 * Assumes that `sam build` was not already performed.
 */
async function compileTypeScript(config: SamLaunchRequestArgs): Promise<void> {
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
    // Note: we use this tsconfig.json as a base for compiling the target=code
    // Lambda app below. If it does not exist, we generate a minimal one.
    const isTsApp = (await findTsOrTsConfig(config.codeRoot, false)) !== undefined
    if (!isTsApp) {
        return
    }

    const loadBaseConfig = (tsConfigPath: PathLike) => {
        if (!existsSync(tsConfigPath)) {
            return undefined
        }

        try {
            const tsConfig = JSON.parse(readFileSync(tsConfigPath).toString())
            getLogger('channel').info(`Using base TypeScript config: ${tsConfigPath}`)
            return tsConfig
        } catch (err) {
            getLogger('channel').error(`Unable to use TypeScript base: ${tsConfigPath}`)
        }

        return undefined
    }

    const tsConfigPath = path.join(config.codeRoot, tsConfigFile)

    const tsConfig =
        loadBaseConfig(tsConfigPath) ?? loadBaseConfig(path.join(config.codeRoot, tsConfigInitialBaseFile)) ?? {}

    if (tsConfig.compilerOptions === undefined) {
        getLogger('channel').info('Creating TypeScript config')
        tsConfig.compilerOptions = {
            target: 'es6',
            module: 'commonjs',
            inlineSourceMap: true,
        }
    }

    const compilerOptions = tsConfig.compilerOptions

    // determine build directory
    const tsBuildDir = path.resolve(config.baseBuildDir, 'output')
    compilerOptions.outDir = tsBuildDir

    // overwrite rootDir, sourceRoot
    compilerOptions.rootDir = '.'
    compilerOptions.sourceRoot = config.codeRoot

    const typeRoots: string[] = Array.isArray(compilerOptions.typeRoots) ? compilerOptions.typeRoots : []
    typeRoots.push('node_modules/@types')
    compilerOptions.typeRoots = [...new Set(typeRoots)]

    const types: string[] = Array.isArray(compilerOptions.types) ? compilerOptions.types : []
    types.push('node')
    compilerOptions.types = [...new Set(types)]

    writeFileSync(tsConfigPath, JSON.stringify(tsConfig, undefined, 4))

    // resolve ts lambda handler to point into build directory relative to codeRoot
    const tsLambdaHandler = path.join(tsBuildDir, config.invokeTarget.lambdaHandler)
    config.invokeTarget.lambdaHandler = pathutil.normalizeSeparator(tsLambdaHandler)
    getLogger('channel').info(`Resolved compiled lambda handler to ${tsLambdaHandler}`)

    const tsc = await systemutil.SystemUtilities.findTypescriptCompiler()
    if (!tsc) {
        throw new Error('TypeScript compiler "tsc" not found in node_modules/ or the system.')
    }

    try {
        getLogger('channel').info(`Compiling TypeScript app with: "${tsc}"`)
        await new ChildProcess(tsc, ['--project', tsConfigPath]).run()
    } catch (error) {
        getLogger('channel').error(`TypeScript compile error: ${error}`)
        throw Error('Failed to compile TypeScript app')
    }
}
