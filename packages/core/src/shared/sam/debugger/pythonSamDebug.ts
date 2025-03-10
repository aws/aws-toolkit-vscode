/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Runtime } from 'aws-sdk/clients/lambda'
import * as os from 'os'
import * as path from 'path'
import {
    isImageLambdaConfig,
    PythonDebugConfiguration,
    PythonPathMapping,
} from '../../../lambda/local/debugConfiguration'
import { RuntimeFamily } from '../../../lambda/models/samLambdaRuntime'
import globals from '../../extensionGlobals'
import { ExtContext } from '../../extensions'
import { fileExists, readFileAsString } from '../../filesystemUtilities'
import { getLogger } from '../../logger/logger'
import * as pathutil from '../../utilities/pathUtils'
import { getLocalRootVariants } from '../../utilities/pathUtils'
import { DefaultSamLocalInvokeCommand, waitForDebuggerMessages } from '../cli/samCliLocalInvoke'
import { runLambdaFunction } from '../localLambdaRunner'
import { SamLaunchRequestArgs } from './awsSamDebugger'
import fs from '../../fs/fs'

/** SAM will mount the --debugger-path to /tmp/lambci_debug_files */
const debugpyWrapperPath = '/tmp/lambci_debug_files/py_debug_wrapper.py'

// TODO: Fix this! Implement a more robust/flexible solution. This is just a basic minimal proof of concept.
export async function getSamProjectDirPathForFile(filepath: string): Promise<string> {
    return path.dirname(filepath)
}

// Add create debugging manifest/requirements.txt containing debugpy
async function makePythonDebugManifest(params: {
    isImageLambda: boolean
    samProjectCodeRoot: string
    outputDir: string
}): Promise<string | undefined> {
    let manifestText = ''
    const manfestPath = path.join(params.samProjectCodeRoot, 'requirements.txt')
    // TODO: figure out how to get debugpy in the container without hacking the user's requirements
    const debugManifestPath = params.isImageLambda ? manfestPath : path.join(params.outputDir, 'debug-requirements.txt')
    if (await fileExists(manfestPath)) {
        manifestText = await readFileAsString(manfestPath)
    }
    getLogger().debug(`pythonCodeLensProvider.makePythonDebugManifest params: %O`, params)

    // TODO: If another module name includes the string "debugpy", this will be skipped...
    if (!manifestText.includes('debugpy')) {
        manifestText += `${os.EOL}debugpy>=1.0,<2`
        await fs.writeFile(debugManifestPath, manifestText)

        return debugManifestPath
    }
    // else we don't need to override the manifest. nothing to return
}

/**
 * Gathers and sets launch-config info by inspecting the workspace and creating
 * temp files/directories as needed.
 *
 * Does NOT execute/invoke SAM, docker, etc.
 */
export async function makePythonDebugConfig(config: SamLaunchRequestArgs): Promise<PythonDebugConfiguration> {
    if (!config.baseBuildDir) {
        throw Error('invalid state: config.baseBuildDir was not set')
    }
    if (!config.codeRoot) {
        // Last-resort attempt to discover the project root (when there is no
        // `launch.json` nor `template.yaml`).
        config.codeRoot = await getSamProjectDirPathForFile(config?.templatePath ?? config.documentUri!.fsPath)
        if (!config.codeRoot) {
            // TODO: return error and show it at the caller.
            throw Error('missing launch.json, template.yaml, and failed to discover project root')
        }
    }
    config.codeRoot = pathutil.normalize(config.codeRoot)

    let manifestPath: string | undefined
    if (!config.noDebug) {
        const isImageLambda = await isImageLambdaConfig(config)

        // Mounted in the Docker container as: /tmp/lambci_debug_files
        config.debuggerPath = globals.context.asAbsolutePath(path.join('resources', 'debugger'))
        // NOTE: SAM CLI splits on each *single* space in `--debug-args`!
        //       Extra spaces will be passed as spurious "empty" arguments :(
        const debugArgs = `${debugpyWrapperPath} --listen 0.0.0.0:${config.debugPort} --wait-for-client --log-to-stderr`
        if (isImageLambda) {
            const params = getPythonExeAndBootstrap(config.runtime)
            config.debugArgs = [`${params.python} ${debugArgs} ${params.bootstrap}`]
        } else {
            config.debugArgs = [debugArgs]
        }

        manifestPath = await makePythonDebugManifest({
            isImageLambda: isImageLambda,
            samProjectCodeRoot: config.codeRoot,
            outputDir: config.baseBuildDir,
        })
    }

    let pathMappings: PythonPathMapping[]
    if (config.lambda?.pathMappings !== undefined) {
        pathMappings = config.lambda.pathMappings
    } else {
        pathMappings = getLocalRootVariants(config.codeRoot).map<PythonPathMapping>((variant) => {
            return {
                localRoot: variant,
                remoteRoot: '/var/task',
            }
        })
    }

    // Make debugpy output log information if our loglevel is at 'debug'
    if (!config.noDebug && getLogger().logLevelEnabled('debug')) {
        config.debugArgs![0] += ' --debug'
    }

    return {
        ...config,
        type: 'python',
        request: config.noDebug ? 'launch' : 'attach',
        runtimeFamily: RuntimeFamily.Python,

        //
        // Python-specific fields.
        //
        manifestPath: manifestPath,
        port: config.debugPort ?? -1,
        host: 'localhost',
        pathMappings,
        // Disable redirectOutput, we collect child process stdout/stderr and
        // explicitly write to Debug Console.
        redirectOutput: false,
    }
}

/**
 * Launches and attaches debugger to a SAM Python project.
 */
export async function invokePythonLambda(
    ctx: ExtContext,
    config: PythonDebugConfiguration
): Promise<PythonDebugConfiguration> {
    config.samLocalInvokeCommand = new DefaultSamLocalInvokeCommand([waitForDebuggerMessages.PYTHON])

    config.onWillAttachDebugger = undefined
    const c = (await runLambdaFunction(ctx, config, async () => {})) as PythonDebugConfiguration
    return c
}

function getPythonExeAndBootstrap(runtime: Runtime) {
    // unfortunately new 'Image'-base images did not standardize the paths
    // https://github.com/aws/aws-sam-cli/blob/7d5101a8edeb575b6925f9adecf28f47793c403c/samcli/local/docker/lambda_debug_settings.py
    switch (runtime) {
        case 'python3.7':
            return { python: '/var/lang/bin/python3.7', bootstrap: '/var/runtime/bootstrap' }
        case 'python3.8':
            return { python: '/var/lang/bin/python3.8', bootstrap: '/var/runtime/bootstrap.py' }
        case 'python3.9':
            return { python: '/var/lang/bin/python3.9', bootstrap: '/var/runtime/bootstrap.py' }
        case 'python3.10':
            return { python: '/var/lang/bin/python3.10', bootstrap: '/var/runtime/bootstrap.py' }
        case 'python3.11':
            return { python: '/var/lang/bin/python3.11', bootstrap: '/var/runtime/bootstrap.py' }
        case 'python3.12':
            return { python: '/var/lang/bin/python3.12', bootstrap: '/var/runtime/bootstrap.py' }
        case 'python3.13':
            return { python: '/var/lang/bin/python3.13', bootstrap: '/var/runtime/bootstrap.py' }
        default:
            throw new Error(`Python SAM debug logic ran for invalid Python runtime: ${runtime}`)
    }
}
