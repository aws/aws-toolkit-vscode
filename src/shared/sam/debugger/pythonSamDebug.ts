/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFile } from 'fs-extra'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { PythonDebugConfiguration, PythonPathMapping } from '../../../lambda/local/debugConfiguration'
import { RuntimeFamily } from '../../../lambda/models/samLambdaRuntime'
import { PythonDebugAdapterHeartbeat } from '../../debug/pythonDebugAdapterHeartbeat'
import { ExtContext, VSCODE_EXTENSION_ID } from '../../extensions'
import { fileExists, readFileAsString } from '../../filesystemUtilities'
import { getLogger } from '../../logger'
import { getStartPort } from '../../utilities/debuggerUtils'
import * as pathutil from '../../utilities/pathUtils'
import { getLocalRootVariants } from '../../utilities/pathUtils'
import { Timeout } from '../../utilities/timeoutUtils'
import { ChannelLogger } from '../../utilities/vsCodeUtils'
import { DefaultSamLocalInvokeCommand, WAIT_FOR_DEBUGGER_MESSAGES } from '../cli/samCliLocalInvoke'
import { invokeLambdaFunction, makeBuildDir, makeInputTemplate } from '../localLambdaRunner'
import { SamLaunchRequestArgs } from './samDebugSession'

const PYTHON_DEBUG_ADAPTER_RETRY_DELAY_MS = 1000

// TODO: Fix this! Implement a more robust/flexible solution. This is just a basic minimal proof of concept.
export async function getSamProjectDirPathForFile(filepath: string): Promise<string> {
    return path.dirname(filepath)
}

// Add create debugging manifest/requirements.txt containing ptvsd
async function makePythonDebugManifest(params: {
    samProjectCodeRoot: string
    outputDir: string
}): Promise<string | undefined> {
    let manifestText = ''
    const manfestPath = path.join(params.samProjectCodeRoot, 'requirements.txt')
    if (await fileExists(manfestPath)) {
        manifestText = await readFileAsString(manfestPath)
    }
    getLogger().debug(`pythonCodeLensProvider.makePythonDebugManifest params: ${JSON.stringify(params, undefined, 2)}`)
    // TODO: Make this logic more robust. What if other module names include ptvsd?
    if (!manifestText.includes('ptvsd')) {
        manifestText += `${os.EOL}ptvsd>4.2,<5`
        const debugManifestPath = path.join(params.outputDir, 'debug-requirements.txt')
        await writeFile(debugManifestPath, manifestText)

        return debugManifestPath
    }
    // else we don't need to override the manifest. nothing to return
}

export async function makeLambdaDebugFile(params: {
    handlerName: string
    debugPort: number
    outputDir: string
}): Promise<{ outFilePath: string; debugHandlerName: string }> {
    const logger = getLogger()

    // Last piece of the handler is the function name. Remove it before modifying for pathing.
    const splitHandlerName = params.handlerName.split('.')
    const handlerFunctionName = splitHandlerName[splitHandlerName.length - 1]
    const handlerFiles = splitHandlerName.slice(0, splitHandlerName.length - 1)

    // Handlers for Python imports must be joined by periods.
    // ./foo/bar.py => foo.bar
    const handlerFileImportPath = handlerFiles.join('.')
    // SAM doesn't handle periods in Python filenames. Replacing with underscores for the filename.
    const handlerFilePrefix = handlerFiles.join('_')

    const debugHandlerFileName = `${handlerFilePrefix}___vsctk___debug`
    const debugHandlerFunctionName = 'lambda_handler'
    // TODO: Sanitize handlerFilePrefix, handlerFunctionName, debugHandlerFunctionName
    try {
        logger.debug('pythonCodeLensProvider.makeLambdaDebugFile params:', JSON.stringify(params, undefined, 2))
        const template = `
# Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import ptvsd
import sys
from ${handlerFileImportPath} import ${handlerFunctionName} as _handler


def ${debugHandlerFunctionName}(event, context):
    ptvsd.enable_attach(address=('0.0.0.0', ${params.debugPort}), redirect_output=False)
    print('${WAIT_FOR_DEBUGGER_MESSAGES.PYTHON}')
    sys.stdout.flush()
    ptvsd.wait_for_attach()
    print('...debugger attached')
    sys.stdout.flush()
    return _handler(event, context)

`

        const outFilePath = path.join(params.outputDir, `${debugHandlerFileName}.py`)
        logger.debug('pythonCodeLensProvider.makeLambdaDebugFile outFilePath:', outFilePath)
        await writeFile(outFilePath, template)

        return {
            outFilePath,
            debugHandlerName: `${debugHandlerFileName}.${debugHandlerFunctionName}`,
        }
    } catch (err) {
        logger.error('makeLambdaDebugFile failed:', err as Error)
        throw err
    }
}

/**
 * Gathers and sets launch-config info by inspecting the workspace and creating
 * temp files/directories as needed.
 *
 * Does NOT execute/invoke SAM, docker, etc.
 */
export async function makePythonDebugConfig(config: SamLaunchRequestArgs): Promise<PythonDebugConfiguration> {
    if (!config.codeRoot) {
        // Last-resort attempt to discover the project root (when there is no
        // `launch.json` nor `template.yaml`).
        config.codeRoot = await getSamProjectDirPathForFile(config?.samTemplatePath ?? config.documentUri!!.fsPath)
        if (!config.codeRoot) {
            // TODO: return error and show it at the caller.
            throw Error('missing launch.json, template.yaml, and failed to discover project root')
        }
    }
    config.codeRoot = pathutil.normalize(config.codeRoot)

    config.baseBuildDir = await makeBuildDir()
    let debugPort: number | undefined
    let manifestPath: string | undefined
    let outFilePath: string | undefined
    if (!config.noDebug) {
        debugPort = await getStartPort()
        const rv = await makeLambdaDebugFile({
            handlerName: config.handlerName,
            debugPort: debugPort,
            outputDir: config.codeRoot,
        })
        outFilePath = rv.outFilePath
        // XXX: Reassign handler name.
        config.handlerName = rv.debugHandlerName
        manifestPath = await makePythonDebugManifest({
            samProjectCodeRoot: config.codeRoot,
            outputDir: config.baseBuildDir,
        })
    }

    config.samTemplatePath = await makeInputTemplate(config)
    const pathMappings: PythonPathMapping[] = getLocalRootVariants(config.codeRoot).map<PythonPathMapping>(variant => {
        return {
            localRoot: variant,
            remoteRoot: '/var/task',
        }
    })

    return {
        ...config,
        type: 'python',
        request: config.noDebug ? 'launch' : 'attach',
        runtimeFamily: RuntimeFamily.Python,
        outFilePath: pathutil.normalize(outFilePath ?? '') ?? undefined,
        name: 'SamLocalDebug',

        //
        // Python-specific fields.
        //
        manifestPath: manifestPath,
        debugPort: debugPort,
        port: debugPort ?? -1,
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
export async function invokePythonLambda(ctx: ExtContext, config: PythonDebugConfiguration) {
    config.samLocalInvokeCommand = new DefaultSamLocalInvokeCommand(ctx.chanLogger, [WAIT_FOR_DEBUGGER_MESSAGES.PYTHON])
    config.onWillAttachDebugger = waitForPythonDebugAdapter
    await invokeLambdaFunction(ctx, config, async () => {})
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
            logger.verbose('Error while testing', err as Error)
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
            // tslint:disable-next-line:max-line-length
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
