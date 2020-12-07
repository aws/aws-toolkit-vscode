/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFile } from 'fs-extra'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import {
    isImageLambdaConfig,
    PythonDebugConfiguration,
    PythonPathMapping,
} from '../../../lambda/local/debugConfiguration'
import { RuntimeFamily } from '../../../lambda/models/samLambdaRuntime'
import { PythonDebugAdapterHeartbeat } from '../../debug/pythonDebugAdapterHeartbeat'
import { ExtContext, VSCODE_EXTENSION_ID } from '../../extensions'
import { fileExists, readFileAsString } from '../../filesystemUtilities'
import { getLogger } from '../../logger'
import * as pathutil from '../../utilities/pathUtils'
import { getLocalRootVariants } from '../../utilities/pathUtils'
import { Timeout } from '../../utilities/timeoutUtils'
import { ChannelLogger } from '../../utilities/vsCodeUtils'
import { DefaultSamLocalInvokeCommand, WAIT_FOR_DEBUGGER_MESSAGES } from '../cli/samCliLocalInvoke'
import { invokeLambdaFunction, makeInputTemplate } from '../localLambdaRunner'
import { SamLaunchRequestArgs } from './awsSamDebugger'
import { join } from 'path'
import { ext } from '../../extensionGlobals'
import { Runtime } from 'aws-sdk/clients/lambda'

const PYTHON_DEBUG_ADAPTER_RETRY_DELAY_MS = 1000

// TODO: Fix this! Implement a more robust/flexible solution. This is just a basic minimal proof of concept.
export async function getSamProjectDirPathForFile(filepath: string): Promise<string> {
    return path.dirname(filepath)
}

// Add create debugging manifest/requirements.txt containing ptvsd
async function makePythonDebugManifest(params: {
    isImageLambda: boolean
    samProjectCodeRoot: string
    outputDir: string
}): Promise<string | undefined> {
    let manifestText = ''
    const manfestPath = path.join(params.samProjectCodeRoot, 'requirements.txt')
    // TODO: figure out how to get ptvsd in the container without hacking the user's requirements
    const debugManifestPath = params.isImageLambda ? manfestPath : path.join(params.outputDir, 'debug-requirements.txt')
    if (await fileExists(manfestPath)) {
        manifestText = await readFileAsString(manfestPath)
    }
    getLogger().debug(`pythonCodeLensProvider.makePythonDebugManifest params: ${JSON.stringify(params, undefined, 2)}`)
    // TODO: Make this logic more robust. What if other module names include ptvsd?
    if (!manifestText.includes('ptvsd')) {
        manifestText += `${os.EOL}ptvsd>4.2,<5`
        await writeFile(debugManifestPath, manifestText)

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
        config.codeRoot = await getSamProjectDirPathForFile(config?.templatePath ?? config.documentUri!!.fsPath)
        if (!config.codeRoot) {
            // TODO: return error and show it at the caller.
            throw Error('missing launch.json, template.yaml, and failed to discover project root')
        }
    }
    config.codeRoot = pathutil.normalize(config.codeRoot)

    let manifestPath: string | undefined
    if (!config.noDebug) {
        config.debuggerPath = ext.context.asAbsolutePath(join('resources', 'debugger'))
        const isImageLambda = isImageLambdaConfig(config)
        const debugArgs = `/tmp/lambci_debug_files/py_debug_wrapper.py --host 0.0.0.0 --port ${config.debugPort} --wait`
        if (isImageLambda) {
            const params = getPythonExeAndBootstrap(config.runtime)
            config.debugArgs = [`${params.python} ${debugArgs} ${params.boostrap}`]
        } else {
            config.debugArgs = [debugArgs]
        }

        manifestPath = await makePythonDebugManifest({
            isImageLambda: isImageLambda,
            samProjectCodeRoot: config.codeRoot,
            outputDir: config.baseBuildDir,
        })
    }

    config.templatePath = await makeInputTemplate(config)

    let pathMappings: PythonPathMapping[]
    if (config.lambda?.pathMappings !== undefined) {
        pathMappings = config.lambda.pathMappings
    } else {
        pathMappings = getLocalRootVariants(config.codeRoot).map<PythonPathMapping>(variant => {
            return {
                localRoot: variant,
                remoteRoot: '/var/task',
            }
        })
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
        // Disable redirectOutput to prevent the Python Debugger from automatically writing stdout/stderr text
        // to the Debug Console. We're taking the child process stdout/stderr and explicitly writing that to
        // the Debug Console.
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
    config.samLocalInvokeCommand = new DefaultSamLocalInvokeCommand(ctx.chanLogger, [WAIT_FOR_DEBUGGER_MESSAGES.PYTHON])
    // eslint-disable-next-line @typescript-eslint/unbound-method
    config.onWillAttachDebugger = waitForPythonDebugAdapter
    const c = (await invokeLambdaFunction(ctx, config, async () => {})) as PythonDebugConfiguration
    return c
}

export async function waitForPythonDebugAdapter(debugPort: number, timeout: Timeout, channelLogger: ChannelLogger) {
    const logger = getLogger()

    logger.verbose(`Testing debug adapter connection on port ${debugPort}`)

    let debugServerAvailable: boolean = false

    while (!debugServerAvailable) {
        const tester = new PythonDebugAdapterHeartbeat(debugPort)

        try {
            if (await tester.connect()) {
                if (await tester.isDebugServerUp()) {
                    logger.verbose('Debug Adapter is available')
                    debugServerAvailable = true
                }
            }
        } catch (err) {
            logger.verbose('Error while testing: %O', err as Error)
        } finally {
            await tester.disconnect()
        }

        if (!debugServerAvailable) {
            if (timeout.remainingTime === 0) {
                break
            }

            logger.verbose('Debug Adapter not ready, retrying...')
            await new Promise<void>(resolve => {
                setTimeout(resolve, PYTHON_DEBUG_ADAPTER_RETRY_DELAY_MS)
            })
        }
    }

    if (!debugServerAvailable) {
        channelLogger.warn(
            'AWS.sam.local.invoke.python.server.not.available',
            'Unable to communicate with the Python Debug Adapter. The debugger might not succeed when attaching to your SAM Application.'
        )
    }
}

export async function activatePythonExtensionIfInstalled() {
    const extension = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.python)

    // If the extension is not installed, it is not a failure. There may be reduced functionality.
    if (extension && !extension.isActive) {
        getLogger().info('Python CodeLens Provider is activating the python extension')
        await extension.activate()
    }
}

function getPythonExeAndBootstrap(runtime: Runtime) {
    // unfortunately new 'Image'-base images did not standardize the paths
    // https://github.com/aws/aws-sam-cli/blob/7d5101a8edeb575b6925f9adecf28f47793c403c/samcli/local/docker/lambda_debug_settings.py
    switch (runtime) {
        case 'python2.7':
            return { python: '/usr/bin/python2.7', boostrap: '/var/runtime/awslambda/bootstrap.py' }
        case 'python3.6':
            return { python: '/var/lang/bin/python3.6', boostrap: '/var/runtime/awslambda/bootstrap.py' }
        case 'python3.7':
            return { python: '/var/lang/bin/python3.7', boostrap: '/var/runtime/bootstrap' }
        case 'python3.8':
            return { python: '/var/lang/bin/python3.8', boostrap: '/var/runtime/bootstrap.py' }
        default:
            throw new Error(`Python SAM debug logic ran for invalid Python runtime: ${runtime}`)
    }
}
