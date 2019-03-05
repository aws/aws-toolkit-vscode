/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { findFileInParentPaths } from '../filesystemUtilities'

import {
    CodeLensProviderParams,
    getInvokeCmdKey,
    makeCodeLenses
} from './codeLensUtils'
import { LambdaLocalInvokeArguments, LocalLambdaRunner } from './localLambdaRunner'

import { DebugConfiguration } from '../../lambda/local/debugConfiguration'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import {
    DefaultSamCliProcessInvoker,
    DefaultSamCliTaskInvoker,
} from '../sam/cli/samCliInvoker'
import {  TypescriptLambdaHandlerSearch } from '../typescriptLambdaHandlerSearch'

interface NodeDebugConfiguration extends DebugConfiguration {
    readonly protocol: 'legacy' | 'inspector'
}

const getSamProjectDirPathForFile = async (filepath: string): Promise<string> => {
    const packageJsonPath: string | undefined = await findFileInParentPaths(
        path.dirname(filepath),
        'package.json'
    )
    if (!packageJsonPath) {
        throw new Error(
            localize(
                'AWS.error.sam.local.package_json_not_found',
                'Unable to find package.json related to {0}',
                filepath
            )
        )
    }

    return path.dirname(packageJsonPath)
}

export const initialize = ({
    configuration,
    toolkitOutputChannel,
    processInvoker = new DefaultSamCliProcessInvoker(),
    taskInvoker = new DefaultSamCliTaskInvoker()
}: CodeLensProviderParams): void => {
    vscode.commands.registerCommand(
        getInvokeCmdKey('javascript'),
        async (args: LambdaLocalInvokeArguments) => {
            let debugPort: number | undefined

            if (args.debug) {
                debugPort = 5858 // TODO: Use utility to find an available port
            }

            const activeFilePath = vscode.window.activeTextEditor!.document.uri.fsPath
            if (!activeFilePath) { // Should we log a warning or throw an error?
              throw new Error('"vscode.window.activeTextEditor" not defined')
            }
            const samProjectCodeRoot = await getSamProjectDirPathForFile(activeFilePath)
            const debugConfig: NodeDebugConfiguration = {
                type: 'node',
                request: 'attach',
                name: 'SamLocalDebug',
                preLaunchTask: undefined,
                address: 'localhost',
                port: debugPort!,
                localRoot: samProjectCodeRoot,
                remoteRoot: '/var/task',
                protocol: 'inspector',
                skipFiles: [
                    '/var/runtime/node_modules/**/*.js',
                    '<node_internals>/**/*.js'
                ]
            }

            const localLambdaRunner: LocalLambdaRunner = new LocalLambdaRunner(
                configuration,
                args,
                debugPort,
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

export const makeTypescriptCodeLensProvider =  (): vscode.CodeLensProvider => {
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
                lang: 'javascript'
            })
        }
    }
}
