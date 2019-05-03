/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as path from 'path'
import * as vscode from 'vscode'
import { NodejsDebugConfiguration } from '../../lambda/local/debugConfiguration'
import { CloudFormation } from '../cloudformation/cloudformation'
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
import {
    LambdaLocalInvokeParams,
    LocalLambdaRunner,
} from './localLambdaRunner'

const unsupportedNodeJsRuntimes: Set<string> = new Set<string>([
    'nodejs4.3',
    'nodejs6.10',
])

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
    outputChannel: toolkitOutputChannel,
    processInvoker = new DefaultSamCliProcessInvoker(),
    taskInvoker = new DefaultSamCliTaskInvoker(),
    telemetryService
}: CodeLensProviderParams): void {

    const invokeLambda = async (params: LambdaLocalInvokeParams & { runtime: string }) => {
        const samProjectCodeRoot = await getSamProjectDirPathForFile(params.document.uri.fsPath)
        let debugPort: number | undefined

        if (params.isDebug) {
            debugPort = await getDebugPort()
        }

        const debugConfig: NodejsDebugConfiguration = {
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
            params,
            debugPort,
            params.runtime,
            toolkitOutputChannel,
            processInvoker,
            taskInvoker,
            debugConfig,
            samProjectCodeRoot,
            telemetryService
        )

        await localLambdaRunner.run()
    }

    const command = getInvokeCmdKey('javascript')
    registerCommand({
        command: command,
        callback: async (params: LambdaLocalInvokeParams): Promise<{ datum: Datum }> => {
            const resource = await CloudFormation.getResourceFromTemplate({
                handlerName: params.handlerName,
                templatePath: params.samTemplate.fsPath
            })
            const runtime = CloudFormation.getRuntime(resource)

            if (params.isDebug && unsupportedNodeJsRuntimes.has(runtime)) {
                vscode.window.showErrorMessage(
                    localize(
                        'AWS.lambda.debug.runtime.unsupported',
                        'Debug support for {0} is currently not supported',
                        runtime
                    )
                )
            } else {
                await invokeLambda({
                    runtime,
                    ...params,
                })
            }

            return getMetricDatum({
                isDebug: params.isDebug,
                command,
                runtime,
            })
        }
    })
}

export function makeTypescriptCodeLensProvider(): vscode.CodeLensProvider {
    return {
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
