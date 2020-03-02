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
import { TypescriptLambdaHandlerSearch } from '../typescriptLambdaHandlerSearch'
import { getChannelLogger, getDebugPort, localize } from '../utilities/vsCodeUtils'

import { nodeJsRuntimes } from '../../lambda/models/samLambdaRuntime'
import { getLogger } from '../logger'
import { DefaultValidatingSamCliProcessInvoker } from '../sam/cli/defaultValidatingSamCliProcessInvoker'
import { recordLambdaInvokeLocal, Result, Runtime } from '../telemetry/telemetry'
import { normalizeSeparator } from '../utilities/pathUtils'
import { CodeLensProviderParams, getInvokeCmdKey, makeCodeLenses } from './codeLensUtils'
import { getHandlerRelativePath, LambdaLocalInvokeParams, LocalLambdaRunner } from './localLambdaRunner'

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
    context,
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
    context.subscriptions.push(vscode.commands.registerCommand(command, async (params: LambdaLocalInvokeParams) => {
        const logger = getLogger()

        const resource = await CloudFormation.getResourceFromTemplate({
            handlerName: params.handlerName,
            templatePath: params.samTemplate.fsPath
        })
        const lambdaRuntime = CloudFormation.getRuntime(resource)
        let invokeResult: Result = 'Succeeded'
        try {
            if (!nodeJsRuntimes.has(lambdaRuntime)) {
                invokeResult = 'Failed'
                logger.error(
                    `Javascript local invoke on ${params.document.uri.fsPath} encountered` +
                        ` unsupported runtime ${lambdaRuntime}`
                )

                vscode.window.showErrorMessage(
                    localize(
                        'AWS.samcli.local.invoke.runtime.unsupported',
                        'Unsupported {0} runtime: {1}',
                        'javascript',
                        lambdaRuntime
                    )
                )
            } else {
                await invokeLambda({
                    runtime: lambdaRuntime,
                    ...params
                })
            }
        } catch (err) {
            invokeResult = 'Failed'
            throw err
        } finally {
            recordLambdaInvokeLocal({
                result: invokeResult,
                runtime: lambdaRuntime as Runtime,
                debug: params.isDebug
            })
        }
    }))
}

export function makeTypescriptCodeLensProvider(): vscode.CodeLensProvider {
    return {
        provideCodeLenses: async (
            document: vscode.TextDocument,
            token: vscode.CancellationToken
        ): Promise<vscode.CodeLens[]> => {
            const search: TypescriptLambdaHandlerSearch = new TypescriptLambdaHandlerSearch(document.uri)
            const handlers: LambdaHandlerCandidate[] = await search.findCandidateLambdaHandlers()

            // For Javascript CodeLenses, store the complete relative pathed handler name
            // (eg: src/app.handler) instead of only the pure handler name (eg: app.handler)
            // Without this, the CodeLens command is unable to resolve a match back to a sam template.
            // This is done to address https://github.com/aws/aws-toolkit-vscode/issues/757
            await decorateHandlerNames(handlers, document.uri.fsPath)

            return makeCodeLenses({
                document,
                handlers,
                token,
                language: 'javascript'
            })
        }
    }
}

/**
 * Applies a full relative path to the Javascript handler that will be stored in the CodeLens commands.
 * @param handlers Handlers to apply relative paths to
 * @param parentDocumentPath Path to the file containing these Lambda Handlers
 */
async function decorateHandlerNames(handlers: LambdaHandlerCandidate[], parentDocumentPath: string): Promise<void> {
    const parentDir = path.dirname(parentDocumentPath)
    const packageJsonPath = await findFileInParentPaths(parentDir, 'package.json')

    if (!packageJsonPath) {
        return
    }

    const relativePath = getHandlerRelativePath({
        codeRoot: path.dirname(packageJsonPath),
        filePath: parentDocumentPath
    })

    handlers.forEach(handler => {
        const handlerName = handler.handlerName

        handler.handlerName = normalizeSeparator(path.join(relativePath, handlerName))
    })
}
