/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { platform } from 'os'
import * as path from 'path'
import * as vscode from 'vscode'

import { PythonDebugConfiguration } from '../../lambda/local/debugConfiguration'
import { writeFile } from '../filesystem'
import { fileExists, readFileAsString } from '../filesystemUtilities'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { getLogger } from '../logger'
import { DefaultSamCliProcessInvoker, DefaultSamCliTaskInvoker, } from '../sam/cli/samCliInvoker'
import { Datum } from '../telemetry/telemetryEvent'
import { registerCommand } from '../telemetry/telemetryUtils'
import { getChannelLogger, getDebugPort } from '../utilities/vsCodeUtils'

import {
    CodeLensProviderParams,
    getInvokeCmdKey,
    getMetricDatum,
    makeCodeLenses,
} from './codeLensUtils'
import {
    executeSamBuild,
    invokeLambdaFunction,
    LambdaLocalInvokeParams,
    makeBuildDir,
    makeInputTemplate,
} from './localLambdaRunner'

export const PYTHON_LANGUAGE = 'python'
export const PYTHON_ALLFILES: vscode.DocumentFilter[] = [
    { language: PYTHON_LANGUAGE }
]

// TODO: Fix this! Implement a more robust/flexible solution. This is just a basic minimal proof of concept.
const getSamProjectDirPathForFile = async (filepath: string): Promise<string> => {
    return path.dirname(filepath)
}

const getLambdaHandlerCandidates = async ({ uri }: { uri: vscode.Uri }): Promise<LambdaHandlerCandidate[]> => {
    const logger = getLogger()
    const filename = uri.fsPath

    logger.info(`Getting symbols for '${uri.fsPath}'`)
    const symbols: vscode.DocumentSymbol[] = ( // SymbolInformation has less detail (no children)
        (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            uri
        )) || []
    )

    return symbols
        .filter(sym => sym.kind === vscode.SymbolKind.Function)
        .map(symbol => {
            logger.debug(`Found potential handler: '${path.parse(filename).name}.${symbol.name}'`)

            return {
                filename,
                handlerName: `${path.parse(filename).name}.${symbol.name}`,
                range: symbol.range
            }
        })
}

// Add create debugging manifest/requirements.txt containing ptvsd
const makePythonDebugManifest = async (params: {
    samProjectCodeRoot: string,
    outputDir: string
}): Promise<string | undefined> => {
    let manifestText = ''
    const manfestPath = path.join(params.samProjectCodeRoot, 'requirements.txt')
    if (fileExists(manfestPath)) {
        manifestText = await readFileAsString(manfestPath)
    }
    getLogger().debug(`makePythonDebugManifest - params: ${JSON.stringify(params, undefined, 2)}`)
    if (manifestText.indexOf('ptvsd') < 0 ) { // TODO: Make this logic more robust
        manifestText += '\nptvsd'
        const debugManifestPath = path.join(params.outputDir, 'debug-requirements.txt')
        await writeFile(debugManifestPath, manifestText)

        return debugManifestPath
    }
    // else we don't need to override the manifest. nothing to return
}

// tslint:disable:no-trailing-whitespace
const makeLambdaDebugFile = async (params: {
    handlerName: string,
    debugPort: number,
    outputDir: string
}): Promise<{outFilePath: string, debugHandlerName: string}> => {
    if (!params.outputDir) {
        throw new Error('Must specify outputDir')
    }
    const logger = getLogger()

    const [handlerFilePrefix, handlerFunctionName] = params.handlerName.split('.')
    const debugHandlerFileName = `${handlerFilePrefix}_debug`
    const debugHandlerFunctionName = 'lambda_handler'
    try {
        logger.info('makeLambdaDebugFile - params:', JSON.stringify(params, undefined, 2))
        const template = `
import ptvsd
from ${handlerFilePrefix} import ${handlerFunctionName} as _handler


def ${debugHandlerFunctionName}(event, context):
    print('waiting for debugger to attach...')
    ptvsd.enable_attach(address=('0.0.0.0', ${params.debugPort}), redirect_output=True)
    ptvsd.wait_for_attach()
    print('debugger attached')
    return _handler(event, context)

`

        const outFilePath = path.join(params.outputDir, `${debugHandlerFileName}.py`)
        logger.info('makeLambdaDebugFile - outFilePath:', outFilePath)
        await writeFile(outFilePath, template)

        return {
            outFilePath,
            debugHandlerName: `${debugHandlerFileName}.${debugHandlerFunctionName}`
        }
    } catch (err) {
        logger.error('makeLambdaDebugFile failed:', err)
        throw err
    }
}

const makeDebugConfig = ({debugPort, samProjectCodeRoot}: {
    debugPort?: number,
    samProjectCodeRoot: string,
}): PythonDebugConfiguration => {
    return {
        type: PYTHON_LANGUAGE,
        request: 'attach',
        name: 'SamLocalDebug',
        host: 'localhost',
        port: debugPort!,
        pathMappings: [
            {
                // tslint:disable-next-line:no-invalid-template-strings
                localRoot: samProjectCodeRoot,
                remoteRoot: '/var/task'
            }
        ],
    }
}

export async function initialize({
    configuration,
    toolkitOutputChannel,
    processInvoker = new DefaultSamCliProcessInvoker(),
    taskInvoker = new DefaultSamCliTaskInvoker()
}: CodeLensProviderParams): Promise<void> {
    const logger = getLogger()

    const runtime = 'python3.6' // TODO: Remove hard coded value

    const invokeLambda = async (args: LambdaLocalInvokeParams) => {
        const samProjectCodeRoot = await getSamProjectDirPathForFile(args.document.uri.fsPath)
        logger.info(`Project root: '${samProjectCodeRoot}'`)

        const baseBuildDir = await makeBuildDir()

        let debugPort: number | undefined

        let handlerName: string
        let manifestPath: string | undefined
        if (args.isDebug) {
            debugPort = await getDebugPort()
            const {debugHandlerName} = await makeLambdaDebugFile({
                handlerName: args.handlerName,
                debugPort: debugPort,
                outputDir: samProjectCodeRoot,
            })
            handlerName = debugHandlerName
            manifestPath = await makePythonDebugManifest({
                samProjectCodeRoot,
                outputDir: baseBuildDir
            })
        } else {
            handlerName = args.handlerName
        }
        const inputTemplatePath = await makeInputTemplate({
            baseBuildDir,
            codeDir: samProjectCodeRoot,
            documentUri: args.document.uri,
            handlerName,
            runtime,
            workspaceUri: args.workspaceFolder.uri
        })
        logger.info(`+++ debug stuff: ${
            JSON.stringify({inputTemplatePath, handlerName, manifestPath}, undefined, 2)
        }`)

        const channelLogger = getChannelLogger(toolkitOutputChannel)
        const codeDir = samProjectCodeRoot
        const samTemplatePath: string = await executeSamBuild({
            baseBuildDir,
            channelLogger,
            codeDir,
            inputTemplatePath,
            manifestPath,
            samProcessInvoker: processInvoker,

        })
    
        const debugConfig: PythonDebugConfiguration = makeDebugConfig({debugPort, samProjectCodeRoot})
        await invokeLambdaFunction({
            baseBuildDir,
            channelLogger,
            configuration,
            debugConfig,
            samTaskInvoker: taskInvoker,
            samTemplatePath,
            documentUri: args.document.uri,
            handlerName,
            isDebug: args.isDebug,
            onWillAttachDebugger: async () => {
                if (platform() === 'darwin') {
                    await new Promise(resolve => {
                        logger.info(`${platform()} hack: sleeeping......`)
                        setTimeout(resolve, 1500)
                    })
                }
            }
        })
    }

    const command = getInvokeCmdKey('python')
    registerCommand({
        command: command,
        callback: async (params: LambdaLocalInvokeParams): Promise<{ datum: Datum }> => {
            await invokeLambda(params)

            return getMetricDatum({
                isDebug: params.isDebug,
                command,
                runtime,
            })
        }
    })
}

export async function makePythonCodeLensProvider(): Promise<vscode.CodeLensProvider> {
    const logger = getLogger()

    return { // CodeLensProvider
        provideCodeLenses: async (
            document: vscode.TextDocument,
            token: vscode.CancellationToken
        ): Promise<vscode.CodeLens[]> => {
            const handlers: LambdaHandlerCandidate[] = await getLambdaHandlerCandidates({ uri: document.uri })
            logger.info('makePythonCodeLensProvider - handlers:', JSON.stringify(handlers, undefined, 2))

            return makeCodeLenses({
                document,
                handlers,
                token,
                language: 'python'
            })
        }
    }
}
