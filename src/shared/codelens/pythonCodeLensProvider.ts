/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as path from 'path'
import * as vscode from 'vscode'

import { NodeDebugConfiguration } from '../../lambda/local/nodeDebugConfiguration'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { DefaultSamCliProcessInvoker, DefaultSamCliTaskInvoker, } from '../sam/cli/samCliInvoker'

import {
    CodeLensProviderParams,
    getInvokeCmdKey,
    getLambdaHandlerCandidates,
    getLogger,
    makeCodeLenses,
    OutputChannelName
} from './codeLensUtils'
import { LambdaLocalInvokeArguments, LocalLambdaRunner } from './localLambdaRunner'

const logger = getLogger(OutputChannelName.ToolKit)

export const PYTHON_LANGUAGE = 'python'
// export const PYTHON: vscode.DocumentFilter[] = [ // TODO: Use this or PYTHON_ALLFILES?
//     { scheme: 'file', language: PYTHON_LANGUAGE },
//     { scheme: 'untitled', language: PYTHON_LANGUAGE }
// ]
export const PYTHON_ALLFILES = [
    { language: PYTHON_LANGUAGE }
]

export const getSamPythonProjectDirPath = async (): Promise<string> => {
    const activeFilePath = vscode.window.activeTextEditor!.document.uri.fsPath
    if (!activeFilePath) {
      throw new Error('"vscode.window.activeTextEditor" not defined')
    }

    return path.dirname(activeFilePath)
}

export const initialize = ({
    configuration,
    toolkitOutputChannel,
    processInvoker = new DefaultSamCliProcessInvoker(),
    taskInvoker = new DefaultSamCliTaskInvoker()
}: CodeLensProviderParams): void => {
    vscode.commands.registerCommand(
        getInvokeCmdKey('python'),
        async (args: LambdaLocalInvokeArguments) => {
            const samProjectCodeRoot = await getSamPythonProjectDirPath()
            logger.debug(`Project root: '${samProjectCodeRoot}'`)
            let debugPort: number | undefined

            if (args.debug) {
                debugPort = 5858
            }

            const debugConfig: NodeDebugConfiguration = {
                type: PYTHON_LANGUAGE,
                request: 'attach',
                name: 'SamLocalDebug',
                preLaunchTask: undefined,
                address: 'localhost',
                port: debugPort!,
                localRoot: samProjectCodeRoot,
                remoteRoot: '/var/task',
                protocol: 'inspector',
                skipFiles: []
            }

            const localLambdaRunner: LocalLambdaRunner = new LocalLambdaRunner(
                configuration,
                args,
                debugPort,
                'python3.7', // TODO: Remove hard coded value
                toolkitOutputChannel,
                processInvoker,
                taskInvoker,
                debugConfig,
                samProjectCodeRoot

            )

            await localLambdaRunner.run()
        }
    )
}

export const makePythonCodeLensProvider = (): vscode.CodeLensProvider => {
    return { // CodeLensProvider
        provideCodeLenses: async (
            document: vscode.TextDocument,
            token: vscode.CancellationToken
        ): Promise<vscode.CodeLens[]> => {
            const handlers: LambdaHandlerCandidate[] = await getLambdaHandlerCandidates({uri: document.uri})

            return makeCodeLenses({
                                      document,
                                      handlers,
                                      token,
                                      lang: 'python'
                                  })
        },
        resolveCodeLens: (
            codeLens: vscode.CodeLens,
            token: vscode.CancellationToken
        ): vscode.ProviderResult<vscode.CodeLens> => {
            throw new Error('not implemented')
        }
    }
}
