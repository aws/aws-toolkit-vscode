/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as path from 'path'
import * as vscode from 'vscode'

import { DebugConfiguration } from '../../lambda/local/debugConfiguration'
import { findFileInParentPaths } from '../filesystemUtilities'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import {
    DefaultSamCliProcessInvoker,
    DefaultSamCliTaskInvoker,
} from '../sam/cli/samCliInvoker'
import { Datum } from '../telemetry/telemetryEvent'
import { registerCommand } from '../telemetry/telemetryUtils'
import { TypescriptLambdaHandlerSearch } from '../typescriptLambdaHandlerSearch'
import { getDebugPort, localize } from '../utilities/vsCodeUtils'

import {
    CodeLensProviderParams,
    getInvokeCmdKey,
    getMetricDatum,
    makeCodeLenses,
} from './codeLensUtils'
import { LambdaLocalInvokeArguments, LocalLambdaRunner } from './localLambdaRunner'

interface NodeDebugConfiguration extends DebugConfiguration {
    readonly protocol: 'legacy' | 'inspector'
}

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
    const runtime = 'nodejs8.10' // TODO: Remove hard coded value

    const invokeLambda = async (args: LambdaLocalInvokeArguments) => {
        const samProjectCodeRoot = await getSamProjectDirPathForFile(args.document.uri.fsPath)
        let debugPort: number | undefined

        if (args.isDebug) {
            debugPort  = await getDebugPort()
        }

        // TODO: Figure out Python specific params and create PythonDebugConfiguration if needed
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
            runtime,
            toolkitOutputChannel,
            processInvoker,
            taskInvoker,
            debugConfig,
            samProjectCodeRoot
        )

        await localLambdaRunner.run()
    }

    const command = getInvokeCmdKey('javascript')
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
