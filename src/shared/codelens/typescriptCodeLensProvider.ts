/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { NodejsDebugConfiguration } from '../../lambda/local/debugConfiguration'
import { CloudFormation } from '../cloudformation/cloudformation'
import { findFileInParentPaths } from '../filesystemUtilities'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { DefaultSamLocalInvokeCommand, WAIT_FOR_DEBUGGER_MESSAGES } from '../sam/cli/samCliLocalInvoke'
import { Datum, TelemetryNamespace } from '../telemetry/telemetryTypes'
import { registerCommand } from '../telemetry/telemetryUtils'
import { TypescriptLambdaHandlerSearch } from '../typescriptLambdaHandlerSearch'
import { getChannelLogger, getDebugPort, localize } from '../utilities/vsCodeUtils'

import { getLogger } from '../logger'
import { DefaultValidatingSamCliProcessInvoker } from '../sam/cli/defaultValidatingSamCliProcessInvoker'
import { CodeLensProviderParams, getInvokeCmdKey, getMetricDatum, makeCodeLenses } from './codeLensUtils'
import { LambdaLocalInvokeParams, LocalLambdaRunner } from './localLambdaRunner'

const supportedNodeJsRuntimes: Set<string> = new Set<string>(['nodejs8.10', 'nodejs10.x'])

async function getSamProjectDirPathForFile(filepath: string): Promise<string> {
    const packageJsonPath: string | undefined = await findFileInParentPaths(path.dirname(filepath), 'package.json')
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
    processInvoker = new DefaultValidatingSamCliProcessInvoker({}),
    localInvokeCommand = new DefaultSamLocalInvokeCommand(getChannelLogger(toolkitOutputChannel), [
        WAIT_FOR_DEBUGGER_MESSAGES.NODEJS
    ]),
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
            skipFiles: ['/var/runtime/node_modules/**/*.js', '<node_internals>/**/*.js']
        }

        const localLambdaRunner: LocalLambdaRunner = new LocalLambdaRunner(
            configuration,
            params,
            debugPort,
            params.runtime,
            toolkitOutputChannel,
            processInvoker,
            localInvokeCommand,
            debugConfig,
            samProjectCodeRoot,
            telemetryService
        )

        await localLambdaRunner.run()
    }

    const command = getInvokeCmdKey('javascript')
    registerCommand({
        command,
        callback: async (params: LambdaLocalInvokeParams): Promise<{ datum: Datum }> => {
            const logger = getLogger()

            const resource = await CloudFormation.getResourceFromTemplate({
                handlerName: params.handlerName,
                templatePath: params.samTemplate.fsPath
            })
            const runtime = CloudFormation.getRuntime(resource)

            if (!supportedNodeJsRuntimes.has(runtime)) {
                logger.error(
                    `Javascript local invoke on ${params.document.uri.fsPath} encountered` +
                        ` unsupported runtime ${runtime}`
                )

                vscode.window.showErrorMessage(
                    localize(
                        'AWS.samcli.local.invoke.runtime.unsupported',
                        'Unsupported {0} runtime: {1}',
                        'javascript',
                        runtime
                    )
                )
            } else {
                await invokeLambda({
                    runtime,
                    ...params
                })
            }

            return getMetricDatum({
                isDebug: params.isDebug,
                runtime
            })
        },
        telemetryName: {
            namespace: TelemetryNamespace.Lambda,
            name: 'invokelocal'
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
