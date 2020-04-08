/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { unlink, writeFile } from 'fs-extra'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { PythonDebugConfiguration, PythonPathMapping } from '../../lambda/local/debugConfiguration'
import { RuntimeFamily } from '../../lambda/models/samLambdaRuntime'
import { ExtContext, VSCODE_EXTENSION_ID } from '../extensions'
import { fileExists, readFileAsString } from '../filesystemUtilities'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { getLogger } from '../logger'
import { DefaultValidatingSamCliProcessInvoker } from '../sam/cli/defaultValidatingSamCliProcessInvoker'
import { DefaultSamLocalInvokeCommand, WAIT_FOR_DEBUGGER_MESSAGES } from '../sam/cli/samCliLocalInvoke'
import { getStartPort } from '../utilities/debuggerUtils'
import { ChannelLogger } from '../utilities/vsCodeUtils'
import {
    executeSamBuild,
    getLambdaInfoFromExistingTemplate,
    invokeLambdaFunction,
    makeBuildDir,
    makeInputTemplate,
} from './localLambdaRunner'
import { PythonDebugAdapterHeartbeat } from './pythonDebugAdapterHeartbeat'
import { getLocalRootVariants } from '../utilities/pathUtils'
import { SamLaunchRequestArgs } from '../sam/debugger/samDebugSession'
import * as pathutil from '../../shared/utilities/pathUtils'

const PYTHON_DEBUG_ADAPTER_RETRY_DELAY_MS = 1000
export const PYTHON_LANGUAGE = 'python'
export const PYTHON_ALLFILES: vscode.DocumentFilter[] = [
    {
        scheme: 'file',
        language: PYTHON_LANGUAGE,
    },
]

// TODO: Fix this! Implement a more robust/flexible solution. This is just a basic minimal proof of concept.
export const getSamProjectDirPathForFile = async (filepath: string): Promise<string> => {
    return path.dirname(filepath)
}

export async function getLambdaHandlerCandidates(uri: vscode.Uri): Promise<LambdaHandlerCandidate[]> {
    const filename = uri.fsPath

    const symbols: vscode.DocumentSymbol[] =
        (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', uri)) ??
        []

    return symbols
        .filter(sym => sym.kind === vscode.SymbolKind.Function)
        .map<LambdaHandlerCandidate>(symbol => {
            return {
                filename,
                handlerName: `${path.parse(filename).name}.${symbol.name}`,
                range: symbol.range,
            }
        })
}

// Add create debugging manifest/requirements.txt containing ptvsd
const makePythonDebugManifest = async (params: {
    samProjectCodeRoot: string
    outputDir: string
}): Promise<string | undefined> => {
    let manifestText = ''
    const manfestPath = path.join(params.samProjectCodeRoot, 'requirements.txt')
    if (await fileExists(manfestPath)) {
        manifestText = await readFileAsString(manfestPath)
    }
    getLogger().debug(`pythonCodeLensProvider.makePythonDebugManifest params: ${JSON.stringify(params, undefined, 2)}`)
    // TODO: Make this logic more robust. What if other module names include ptvsd?
    if (manifestText.indexOf('ptvsd') < 0) {
        manifestText += `${os.EOL}ptvsd>4.2,<5`
        const debugManifestPath = path.join(params.outputDir, 'debug-requirements.txt')
        await writeFile(debugManifestPath, manifestText)

        return debugManifestPath
    }
    // else we don't need to override the manifest. nothing to return
}

// tslint:disable:no-trailing-whitespace
const makeLambdaDebugFile = async (params: {
    handlerName: string
    debugPort: number
    outputDir: string
}): Promise<{ outFilePath: string; debugHandlerName: string }> => {
    if (!params.outputDir) {
        throw new Error('Must specify outputDir')
    }
    const logger = getLogger()

    const [handlerFilePrefix, handlerFunctionName] = params.handlerName.split('.')
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
from ${handlerFilePrefix} import ${handlerFunctionName} as _handler


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
export async function makePythonDebugConfig(
    config: SamLaunchRequestArgs,
    isDebug: boolean,
    runtime: string,
    handlerName: string
): Promise<PythonDebugConfiguration> {
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

    const baseBuildDir = await makeBuildDir()
    let debugPort: number | undefined
    let manifestPath: string | undefined
    let outFilePath: string | undefined
    if (isDebug) {
        debugPort = await getStartPort()
        const rv = await makeLambdaDebugFile({
            handlerName: handlerName,
            debugPort: debugPort,
            outputDir: config.codeRoot,
        })
        outFilePath = rv.outFilePath
        // XXX: Reassign handler name.
        handlerName = rv.debugHandlerName
        manifestPath = await makePythonDebugManifest({
            samProjectCodeRoot: config.codeRoot,
            outputDir: baseBuildDir,
        })
    }

    const relativeOriginalFunctionHandler = config.handlerName
    const relativeFunctionHandler = handlerName
    const lambdaInfo = await getLambdaInfoFromExistingTemplate({
        workspaceUri: config.workspaceFolder.uri,
        relativeOriginalFunctionHandler,
    })
    const inputTemplatePath = await makeInputTemplate({
        baseBuildDir,
        codeDir: config.codeRoot,
        relativeFunctionHandler,
        globals: lambdaInfo && lambdaInfo.templateGlobals ? lambdaInfo.templateGlobals : undefined,
        properties: lambdaInfo && lambdaInfo.resource.Properties ? lambdaInfo.resource.Properties : undefined,
        runtime: runtime,
    })
    const pathMappings: PythonPathMapping[] = getLocalRootVariants(config.codeRoot).map<PythonPathMapping>(variant => {
        return {
            localRoot: variant,
            remoteRoot: '/var/task',
        }
    })

    return {
        ...config,
        type: 'python',
        request: 'attach',
        runtimeFamily: RuntimeFamily.Python,
        outFilePath: pathutil.normalize(outFilePath ?? ''),
        baseBuildDir: baseBuildDir,
        noDebug: false,
        samTemplatePath: inputTemplatePath,
        originalSamTemplatePath: inputTemplatePath,
        name: 'SamLocalDebug',

        //
        // Python-specific fields.
        //
        manifestPath: manifestPath ?? 'unknown',
        debugPort: debugPort,
        port: debugPort ?? -1,
        runtime: runtime,
        handlerName: handlerName,
        originalHandlerName: handlerName,
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
    // Switch over to the output channel so the user has feedback that we're getting things ready
    ctx.chanLogger.channel.show(true)
    ctx.chanLogger.info('AWS.output.sam.local.start', 'Preparing to run {0} locally...', config.handlerName)

    config.samLocalInvokeCommand = new DefaultSamLocalInvokeCommand(ctx.chanLogger, [
        // TODO: enable this?
        // WAIT_FOR_DEBUGGER_MESSAGES.PYTHON,
    ])
    const processInvoker = new DefaultValidatingSamCliProcessInvoker({})

    try {
        // logger.debug(
        //     `pythonCodeLensProvider.invokeLambda: ${JSON.stringify(
        //         { samProjectCodeRoot, config.samTemplatePath!!, handlerName, manifestPath },
        //         undefined,
        //         2
        //     )}`
        // )
        const inputTemplatePath = config.samTemplatePath!!

        // XXX: reassignment
        config.samTemplatePath = await executeSamBuild({
            baseBuildDir: config.baseBuildDir!!,
            channelLogger: ctx.chanLogger,
            codeDir: config.invokeTarget.target === 'template' ? path.dirname(config.codeRoot) : config.codeRoot,
            inputTemplatePath: inputTemplatePath,
            manifestPath: config.manifestPath,
            samProcessInvoker: processInvoker,
            useContainer: config.sam?.containerBuild || false,
        })
        if (config.invokeTarget.target === 'template') {
            // XXX: reassignment
            config.invokeTarget.samTemplatePath = config.samTemplatePath
        }

        config.onWillAttachDebugger = waitForPythonDebugAdapter

        await invokeLambdaFunction(ctx, config)
    } catch (err) {
        const error = err as Error
        ctx.chanLogger.error(
            'AWS.error.during.sam.local',
            'An error occurred trying to run SAM Application locally: {0}',
            error
        )
    } finally {
        if (config.outFilePath) {
            await deleteFile(config.outFilePath)
        }
    }
}

export async function waitForPythonDebugAdapter(
    debugPort: number,
    timeoutDurationMillis: number,
    channelLogger: ChannelLogger
) {
    const logger = getLogger()
    const stopMillis = Date.now() + timeoutDurationMillis

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
            if (Date.now() > stopMillis) {
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

// Convenience method to swallow any errors
async function deleteFile(filePath: string): Promise<void> {
    try {
        await unlink(filePath)
    } catch (err) {
        getLogger().warn(err as Error)
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
