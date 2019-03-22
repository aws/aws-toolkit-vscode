/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as path from 'path'
import * as vscode from 'vscode'

import { DebugConfiguration } from '../../lambda/local/debugConfiguration'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { getLogger } from '../logger'
import {
    DefaultSamCliProcessInvoker,
    DefaultSamCliTaskInvoker
} from '../sam/cli/samCliInvoker'
import { Datum } from '../telemetry/telemetryEvent'
import { registerCommand } from '../telemetry/telemetryUtils'
import { getDebugPort } from '../utilities/vsCodeUtils'

import {
    CodeLensProviderParams,
    getInvokeCmdKey,
    getMetricDatum,
    makeCodeLenses,
} from './codeLensUtils'
import { LambdaLocalInvokeArguments, LocalLambdaRunner } from './localLambdaRunner'

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

export function initialize({
    configuration,
    toolkitOutputChannel,
    processInvoker = new DefaultSamCliProcessInvoker(),
    taskInvoker = new DefaultSamCliTaskInvoker()
}: CodeLensProviderParams): void {
    const logger = getLogger()

    const runtime = 'python3.7' // TODO: Remove hard coded value

    const invokeLambda = async (args: LambdaLocalInvokeArguments) => {
        const samProjectCodeRoot = await getSamProjectDirPathForFile(args.document.uri.fsPath)
        logger.debug(`Project root: '${samProjectCodeRoot}'`)
        let debugPort: number | undefined

        if (args.isDebug) {
            debugPort = await getDebugPort()
        }
        // TODO: Figure out Python specific params and create PythonDebugConfiguration if needed
        const debugConfig: DebugConfiguration = {
            type: PYTHON_LANGUAGE,
            request: 'attach',
            name: 'SamLocalDebug',
            preLaunchTask: undefined,
            address: 'localhost',
            port: debugPort!,
            localRoot: samProjectCodeRoot,
            remoteRoot: '/var/task',
            skipFiles: []
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
            // TODO: Use onWillAttachDebugger &/or onDidSamBuild to enable debugging support
        )

        await localLambdaRunner.run()
    }

    const command = getInvokeCmdKey('python')
    registerCommand({
        command: command,
        callback: async (args: LambdaLocalInvokeArguments): Promise<{ datum: Datum }> => {
            await invokeLambda(args)

            return getMetricDatum({
                isDebug: args.isDebug,
                command,
                runtime,
            })
        }
    })
}

export function makePythonCodeLensProvider(): vscode.CodeLensProvider {
    return { // CodeLensProvider
        provideCodeLenses: async (
            document: vscode.TextDocument,
            token: vscode.CancellationToken
        ): Promise<vscode.CodeLens[]> => {
            const handlers: LambdaHandlerCandidate[] = await getLambdaHandlerCandidates({ uri: document.uri })

            return makeCodeLenses({
                document,
                handlers,
                token,
                language: 'python'
            })
        }
    }
}
