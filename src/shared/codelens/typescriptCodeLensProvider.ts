/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as path from 'path'
import * as vscode from 'vscode'

import { findFileInParentPaths } from '../filesystemUtilities'
import { getDebugPort, localize } from '../utilities/vsCodeUtils'

import {
    CodeLensProviderParams,
    getInvokeCmdKey,
    makeCodeLenses
} from './codeLensUtils'
import { LambdaLocalInvokeArguments, LocalLambdaRunner } from './localLambdaRunner'

import { NodeDebugConfiguration } from '../../lambda/local/nodeDebugConfiguration'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import {
    DefaultSamCliProcessInvoker,
    DefaultSamCliTaskInvoker,
} from '../sam/cli/samCliInvoker'

import { TypescriptLambdaHandlerSearch } from '../typescriptLambdaHandlerSearch'

async function getSamProjectDirPathForFile(filepath: string): Promise<string> {
    const packageJsonPath: string | undefined = await findFileInParentPaths(
        path.dirname(filepath),
        'package.json'
    )
    if (!packageJsonPath) {
        throw new Error( // TODO: Do we want to localize errors? This might be confusing if we need to review logs.
            localize(
                'AWS.error.sam.local.package_json_not_found',
                'Unable to find package.json related to {0}',
                filepath
            )
        )
    }

    return path.dirname(packageJsonPath)
}

export function initialize({
    configuration,
    toolkitOutputChannel,
    processInvoker = new DefaultSamCliProcessInvoker(),
    taskInvoker = new DefaultSamCliTaskInvoker()
}: CodeLensProviderParams): void {
    vscode.commands.registerCommand(
        getInvokeCmdKey('javascript'),
        async (args: LambdaLocalInvokeArguments) => {

            const activeFilePath = args.document.uri.fsPath
            if (!activeFilePath) { // Should we log a warning or throw an error?
              throw new Error("'vscode.window.activeTextEditor' not defined")
            }
            const samProjectCodeRoot = await getSamProjectDirPathForFile(activeFilePath)
            const debugConfig: NodeDebugConfiguration = {
                type: 'node',
                request: 'attach',
                name: 'SamLocalDebug',
                preLaunchTask: undefined,
                address: 'localhost',
                port: await getDebugPort(),
                localRoot: samProjectCodeRoot,
                remoteRoot: '/var/task',
                protocol: 'inspector',
                skipFiles: [
                    '/var/runtime/node_modules/**/*.js',
                    '<node_internals>/**/*.js'
                ]
            }

            if (args.debug) {
                debugConfig.debugPort = 5858 // TODO: Use utility to find an available port
            }

            const localLambdaRunner: LocalLambdaRunner = new LocalLambdaRunner(
                configuration,
                args,
                args.debug ? debugConfig.port : undefined,
                'nodejs8.10', // TODO: Remove hard coded value
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

export function makeTypescriptCodeLensProvider(): vscode.CodeLensProvider {
    return { // CodeLensProvider
        provideCodeLenses: async (
            document: vscode.TextDocument,
            token: vscode.CancellationToken
        ): Promise<vscode.CodeLens[]> => {
            const search: TypescriptLambdaHandlerSearch = new TypescriptLambdaHandlerSearch(document.uri)
            const handlers: LambdaHandlerCandidate[] = await search.findCandidateLambdaHandlers()

            return makeCodeLenses({
                document,
                handlers,
                token,
                language: 'javascript'
            })
        }
    }
}
