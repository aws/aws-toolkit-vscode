/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as path from 'path'
import * as vscode from 'vscode'

import { DebugConfiguration } from '../../lambda/local/debugConfiguration'
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

// TODO: Fix this! Implement a more robust/flexible solution. This is just a basic minimal proof of concept.
const getSamProjectDirPathForFile = async (filepath: string): Promise<string> => {
    return path.dirname(filepath)
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
            const activeFilePath = vscode.window.activeTextEditor!.document.uri.fsPath
            if (!activeFilePath) {
              throw new Error('"vscode.window.activeTextEditor" not defined :(')
            }
            const samProjectCodeRoot = await getSamProjectDirPathForFile(activeFilePath)
            logger.debug(`Project root: '${samProjectCodeRoot}'`)
            let debugPort: number | undefined

            if (args.debug) {
                debugPort = 5858 // TODO: Use utility to find an available port
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
                'python3.7', // TODO: Remove hard coded value
                toolkitOutputChannel,
                processInvoker,
                taskInvoker,
                debugConfig,
                samProjectCodeRoot,
                // TODO: Use onWillAttachDebugger &/or onDidSamBuild to enable debugging support
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
        }
    }
}
