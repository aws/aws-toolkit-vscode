/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'

import { PythonDebugConfiguration } from '../../lambda/local/debugConfiguration'
import { unlink, writeFile } from '../filesystem'
import { fileExists, readFileAsString } from '../filesystemUtilities'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { getLogger } from '../logger'
import {
    DefaultSamCliProcessInvoker,
    DefaultSamCliTaskInvoker
} from '../sam/cli/samCliInvoker'
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
    getHandlerRelativePath,
    getLambdaInfoFromExistingTemplate,
    getRelativeFunctionHandler,
    getRuntimeForLambda,
    invokeLambdaFunction,
    LambdaLocalInvokeParams,
    makeBuildDir,
    makeInputTemplate,
} from './localLambdaRunner'

export const PYTHON_LANGUAGE = 'python'
export const PYTHON_ALLFILES: vscode.DocumentFilter[] = [
    {
        scheme: 'file',
        language: PYTHON_LANGUAGE
    }
]

// TODO: Fix this! Implement a more robust/flexible solution. This is just a basic minimal proof of concept.
const getSamProjectDirPathForFile = async (filepath: string): Promise<string> => {
    return path.dirname(filepath)
}

const getLambdaHandlerCandidates = async ({ uri }: { uri: vscode.Uri }): Promise<LambdaHandlerCandidate[]> => {
    const logger = getLogger()
    const filename = uri.fsPath
    const symbols: vscode.DocumentSymbol[] = (
        (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            uri
        )) || []
    )

    return symbols
        .filter(sym => sym.kind === vscode.SymbolKind.Function)
        .map(symbol => {
            logger.debug(`pythonCodeLensProviderFound.getLambdaHandlerCandidates: ${
                JSON.stringify({
                    filePath: uri.fsPath,
                    handlerName: `${path.parse(filename).name}.${symbol.name}`
                })
                }`)

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
    handlerName: string,
    debugPort: number,
    outputDir: string
}): Promise<{ outFilePath: string, debugHandlerName: string }> => {
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
    ptvsd.enable_attach(address=('0.0.0.0', ${params.debugPort}), redirect_output=True)
    print('Waiting for debugger to attach...')
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
            debugHandlerName: `${debugHandlerFileName}.${debugHandlerFunctionName}`
        }
    } catch (err) {
        logger.error('makeLambdaDebugFile failed:', err as Error)
        throw err
    }
}

const fixFilePathCapitalization = (filePath: string): string => {
    if (process.platform === 'win32') {
        return filePath.replace(/^[a-z]/, match => match.toUpperCase())
    }

    return filePath
}

const makeDebugConfig = ({ debugPort, samProjectCodeRoot }: {
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
                localRoot: fixFilePathCapitalization(samProjectCodeRoot),
                remoteRoot: '/var/task'
            }
        ],
    }
}

export async function initialize({
    configuration,
    outputChannel: toolkitOutputChannel,
    processInvoker = new DefaultSamCliProcessInvoker(),
    taskInvoker = new DefaultSamCliTaskInvoker(),
    telemetryService: telemetryService,
}: CodeLensProviderParams): Promise<void> {
    const logger = getLogger()
    const channelLogger = getChannelLogger(toolkitOutputChannel)

    const invokeLambda = async (args: LambdaLocalInvokeParams & { runtime: string }) => {
        // Switch over to the output channel so the user has feedback that we're getting things ready
        channelLogger.channel.show(true)

        channelLogger.info(
            'AWS.output.sam.local.start',
            'Preparing to run {0} locally...',
            args.handlerName
        )

        const samProjectCodeRoot = await getSamProjectDirPathForFile(args.document.uri.fsPath)
        const baseBuildDir = await makeBuildDir()

        let debugPort: number | undefined

        let handlerName: string = args.handlerName
        let manifestPath: string | undefined
        let lambdaDebugFilePath: string | undefined
        if (args.isDebug) {
            debugPort = await getDebugPort()
            const { debugHandlerName, outFilePath } = await makeLambdaDebugFile({
                handlerName: args.handlerName,
                debugPort: debugPort,
                outputDir: samProjectCodeRoot,
            })
            lambdaDebugFilePath = outFilePath
            handlerName = debugHandlerName
            manifestPath = await makePythonDebugManifest({
                samProjectCodeRoot,
                outputDir: baseBuildDir
            })
        }
        
        const handlerFileRelativePath = getHandlerRelativePath({
            codeRoot: samProjectCodeRoot,
            filePath: args.document.uri.fsPath
        })

        const relativeOriginalFunctionHandler = getRelativeFunctionHandler({
            handlerName: args.handlerName,
            runtime: args.runtime,
            handlerFileRelativePath
        })

        const relativeFunctionHandler = getRelativeFunctionHandler({
            handlerName: handlerName,
            runtime: args.runtime,
            handlerFileRelativePath
        })

        const lambdaInfo = await getLambdaInfoFromExistingTemplate({
            workspaceUri: args.workspaceFolder.uri,
            relativeOriginalFunctionHandler
        })

        const inputTemplatePath = await makeInputTemplate({
            baseBuildDir,
            codeDir: samProjectCodeRoot,
            relativeFunctionHandler,
            properties: lambdaInfo && lambdaInfo.resource.Properties ? lambdaInfo.resource.Properties : undefined,
            runtime: args.runtime
        })

        logger.debug(`pythonCodeLensProvider.initialize: ${
            JSON.stringify({ samProjectCodeRoot, inputTemplatePath, handlerName, manifestPath }, undefined, 2)
            }`)

        const codeDir = samProjectCodeRoot
        const samTemplatePath: string = await executeSamBuild({
            baseBuildDir,
            channelLogger,
            codeDir,
            inputTemplatePath,
            manifestPath,
            samProcessInvoker: processInvoker,

        })

        const debugConfig: PythonDebugConfiguration = makeDebugConfig({ debugPort, samProjectCodeRoot })
        await invokeLambdaFunction({
            baseBuildDir,
            channelLogger,
            configuration,
            debugConfig,
            samTaskInvoker: taskInvoker,
            originalSamTemplatePath: args.samTemplate.fsPath,
            samTemplatePath,
            documentUri: args.document.uri,
            originalHandlerName: args.handlerName,
            handlerName,
            isDebug: args.isDebug,
            runtime: args.runtime,
            telemetryService
        })
        if (args.isDebug && lambdaDebugFilePath) {
            await unlink(lambdaDebugFilePath)
        }
    }

    const command = getInvokeCmdKey('python')
    registerCommand({
        command: command,
        callback: async (params: LambdaLocalInvokeParams): Promise<{ datum: Datum }> => {
    
            const runtime = await getRuntimeForLambda({
              handlerName: params.handlerName,
              templatePath: params.samTemplate.fsPath
            })

            await invokeLambda({
                runtime,
                ...params
            })

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
            logger.debug(
                'pythonCodeLensProvider.makePythonCodeLensProvider handlers:',
                JSON.stringify(handlers, undefined, 2)
            )

            return makeCodeLenses({
                document,
                handlers,
                token,
                language: 'python'
            })
        }
    }
}
