/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as path from 'path'
import * as vscode from 'vscode'

import { PythonDebugConfiguration } from '../../lambda/local/debugConfiguration'
import { rename, writeFile } from '../filesystem'
import { fileExists, readFileAsString } from '../filesystemUtilities'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { getLogger } from '../logger'
import { DefaultSamCliProcessInvoker, DefaultSamCliTaskInvoker, } from '../sam/cli/samCliInvoker'
import { Datum } from '../telemetry/telemetryEvent'
import { registerCommand } from '../telemetry/telemetryUtils'
import { getDebugPort } from '../utilities/vsCodeUtils'

import {
    CodeLensProviderParams,
    getInvokeCmdKey,
    getMetricDatum,
    makeCodeLenses,
} from './codeLensUtils'
import { LambdaLocalInvokeParams, LocalLambdaRunner, OnDidSamBuildParams } from './localLambdaRunner'

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
    samProjectCodeRoot: string
}): Promise<string | undefined> => {
    let manifestText = ''
    const manfestPath = path.join(params.samProjectCodeRoot, 'requirements.txt')
    if (fileExists(manfestPath)) {
        manifestText = await readFileAsString(manfestPath)
    }
    getLogger().debug('makePythonDebugManifest - samProjectCodeRoot:', params.samProjectCodeRoot)
    if (manifestText.indexOf('ptvsd') < 0 ) { // TODO: Make this logic more robust
        manifestText += '\nptvsd'
        // TODO: Decide where we should put the debugManifestPath
        const debugManifestPath = path.join(params.samProjectCodeRoot, 'debug-requirements.txt')
        await writeFile(debugManifestPath, manifestText)

        return debugManifestPath
    }
    // else we don't need to override the manifest. nothing to return
}

const getBackupHandlerFilePrefix = (handlerFilePrefix: string) => {
    return `${handlerFilePrefix}_orig`
}

// Create debuggable Lambda handler if needed
const onDidSamBuild = async (params: OnDidSamBuildParams) => {
    const logger = getLogger()
    logger.info(`onDidSamBuild - params: ${JSON.stringify(params, undefined, 2)}`)
    if (params.isDebug) {
        const samBuildProjectDir = path.join(params.buildDir, 'awsToolkitSamLocalResource')
        const [handlerFilePrefix, handlerFunctionName] = params.handlerName.split('.')
        const originalHandlerFilePath = path.join(samBuildProjectDir, `${handlerFilePrefix}.py`)
        const newHandlerFilePath = path.join(samBuildProjectDir, `${getBackupHandlerFilePrefix(handlerFilePrefix)}.py`)
        await rename(originalHandlerFilePath, newHandlerFilePath)
        await makeLambdaDebugFile({
            handlerFunctionName,
            handlerFilePrefix,
            debugPort: params.debugPort,
            samBuildProjectDir: samBuildProjectDir
        })
    }
}

// tslint:disable:no-trailing-whitespace
const makeLambdaDebugFile = async (params: {
    handlerFunctionName: string,
    handlerFilePrefix: string,
    debugPort: number,
    samBuildProjectDir: string
}) => {
    if (!params.samBuildProjectDir) {
        throw new Error('Must specify params.samBuildProjectDir')
    }
    const logger = getLogger()
    try {
        logger.info('makeLambdaDebugFile - params:', JSON.stringify(params, undefined, 2))
        const template = `
import ptvsd
from ${getBackupHandlerFilePrefix(params.handlerFilePrefix)} import ${params.handlerFunctionName} as _handler

print('waiting for debugger to attach...')
# Enable ptvsd on 0.0.0.0 address and on port 5890 that we'll connect later with our IDE
ptvsd.enable_attach(address=('0.0.0.0', ${params.debugPort}), redirect_output=True)
ptvsd.wait_for_attach()
print('debugger attached')


def ${params.handlerFunctionName}(event, context):
    return _handler(event, context)

`

        const outFilePath = path.join(params.samBuildProjectDir, `${params.handlerFilePrefix}.py`)
        logger.info('makeLambdaDebugFile - outFilePath:', outFilePath)
        await writeFile(outFilePath, template)
    } catch (err) {
        logger.error('makeLambdaDebugFile failed:', err)
    }
}

export function initialize({
    configuration,
    toolkitOutputChannel,
    processInvoker = new DefaultSamCliProcessInvoker(),
    taskInvoker = new DefaultSamCliTaskInvoker()
}: CodeLensProviderParams): void {
    const logger = getLogger()

    const runtime = 'python3.6' // TODO: Remove hard coded value

    const invokeLambda = async (args: LambdaLocalInvokeParams) => {
        const samProjectCodeRoot = await getSamProjectDirPathForFile(args.document.uri.fsPath)
        logger.info(`Project root: '${samProjectCodeRoot}'`)
        let debugPort: number | undefined

        if (args.isDebug) {
            debugPort = await getDebugPort()
        }
        // TODO: Figure out Python specific params and create PythonDebugConfiguration if needed
        const debugConfig: PythonDebugConfiguration = {
            type: PYTHON_LANGUAGE,
            request: 'attach',
            name: 'SamLocalDebug',
            host: 'localhost',
            port: debugPort!,
            pathMappings: [
                {
                    localRoot: samProjectCodeRoot,
                    remoteRoot: '/var/task'
                }
            ],
        }

        const localLambdaRunner: LocalLambdaRunner = new LocalLambdaRunner(
            configuration,
            args,
            debugPort,
            runtime,
            toolkitOutputChannel,
            processInvoker,
            taskInvoker,
            debugConfig,
            samProjectCodeRoot,
            await makePythonDebugManifest({ samProjectCodeRoot }),
            onDidSamBuild
        )

        await localLambdaRunner.run()
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
