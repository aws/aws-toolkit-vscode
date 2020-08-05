/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'

import { CloudFormation } from '../cloudformation/cloudformation'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { getLogger } from '../logger'
import { localize } from '../utilities/vsCodeUtils'
import * as pythonDebug from '../sam/debugger/pythonSamDebug'
import * as pythonCodelens from './pythonCodeLensProvider'
import * as csharpCodelens from './csharpCodeLensProvider'
import * as tsCodelens from './typescriptCodeLensProvider'
import { LambdaLocalInvokeParams } from '../sam/localLambdaRunner'
import { ExtContext } from '../extensions'
import { recordLambdaInvokeLocal, Result, Runtime } from '../telemetry/telemetry'
import { nodeJsRuntimes, RuntimeFamily } from '../../lambda/models/samLambdaRuntime'
import { CODE_TARGET_TYPE } from '../sam/debugger/awsSamDebugConfiguration'
import { getReferencedHandlerPaths, LaunchConfiguration } from '../debug/launchConfiguration'

export type Language = 'python' | 'javascript' | 'csharp'

interface MakeAddDebugConfigCodeLensParams {
    handlerName: string
    range: vscode.Range
    rootUri: vscode.Uri
    runtimeFamily: RuntimeFamily
}

export async function makeCodeLenses({
    document,
    token,
    handlers,
    runtimeFamily,
}: {
    document: vscode.TextDocument
    token: vscode.CancellationToken
    handlers: LambdaHandlerCandidate[]
    runtimeFamily: RuntimeFamily
}): Promise<vscode.CodeLens[]> {
    const workspaceFolder: vscode.WorkspaceFolder | undefined = vscode.workspace.getWorkspaceFolder(document.uri)

    if (!workspaceFolder) {
        throw new Error(`Source file ${document.uri} is external to the current workspace.`)
    }

    const lenses: vscode.CodeLens[] = []
    const existingConfigs = getReferencedHandlerPaths(new LaunchConfiguration(document.uri))
    for (const handler of handlers) {
        // handler.range is a RangeOrCharOffset union type. Extract vscode.Range.
        const range =
            handler.range instanceof vscode.Range
                ? handler.range
                : new vscode.Range(
                      document.positionAt(handler.range.positionStart),
                      document.positionAt(handler.range.positionEnd)
                  )

        try {
            const baseParams: MakeAddDebugConfigCodeLensParams = {
                handlerName: handler.handlerName,
                range,
                rootUri: handler.manifestUri,
                runtimeFamily,
            }
            if (!existingConfigs.has(path.join(path.dirname(baseParams.rootUri.fsPath), baseParams.handlerName))) {
                lenses.push(makeAddCodeSamDebugCodeLens(baseParams))
            }
        } catch (err) {
            getLogger().error(
                `Could not generate 'configure' code lens for handler '${handler.handlerName}': %O`,
                err as Error
            )
        }
    }

    return lenses
}

export function getInvokeCmdKey(language: Language) {
    return `aws.lambda.local.invoke.${language}`
}

function makeAddCodeSamDebugCodeLens(params: MakeAddDebugConfigCodeLensParams): vscode.CodeLens {
    const command: vscode.Command = {
        title: localize('AWS.command.addSamDebugConfiguration', 'Add Debug Configuration'),
        command: 'aws.addSamDebugConfiguration',
        // Values provided by makeTypescriptCodeLensProvider(),
        // makeCSharpCodeLensProvider(), makePythonCodeLensProvider().
        arguments: [
            {
                resourceName: params.handlerName,
                rootUri: params.rootUri,
                runtimeFamily: params.runtimeFamily,
            },
            CODE_TARGET_TYPE,
        ],
    }

    return new vscode.CodeLens(params.range, command)
}

export async function makePythonCodeLensProvider(): Promise<vscode.CodeLensProvider> {
    const logger = getLogger()

    return {
        // CodeLensProvider
        provideCodeLenses: async (
            document: vscode.TextDocument,
            token: vscode.CancellationToken
        ): Promise<vscode.CodeLens[]> => {
            // Try to activate the Python Extension before requesting symbols from a python file
            await pythonDebug.activatePythonExtensionIfInstalled()
            if (token.isCancellationRequested) {
                return []
            }

            const handlers: LambdaHandlerCandidate[] = await pythonCodelens.getLambdaHandlerCandidates(document.uri)
            logger.debug(
                'pythonCodeLensProvider.makePythonCodeLensProvider handlers: %s',
                JSON.stringify(handlers, undefined, 2)
            )

            return makeCodeLenses({
                document,
                handlers,
                token,
                runtimeFamily: RuntimeFamily.Python,
            })
        },
    }
}

export async function makeCSharpCodeLensProvider(): Promise<vscode.CodeLensProvider> {
    const logger = getLogger()

    return {
        provideCodeLenses: async (
            document: vscode.TextDocument,
            token: vscode.CancellationToken
        ): Promise<vscode.CodeLens[]> => {
            const handlers: LambdaHandlerCandidate[] = await csharpCodelens.getLambdaHandlerCandidates(document)
            logger.debug('makeCSharpCodeLensProvider handlers: %s', JSON.stringify(handlers, undefined, 2))

            return makeCodeLenses({
                document,
                handlers,
                token,
                runtimeFamily: RuntimeFamily.DotNetCore,
            })
        },
    }
}

export function makeTypescriptCodeLensProvider(): vscode.CodeLensProvider {
    const logger = getLogger()

    return {
        provideCodeLenses: async (
            document: vscode.TextDocument,
            token: vscode.CancellationToken
        ): Promise<vscode.CodeLens[]> => {
            const handlers = await tsCodelens.getLambdaHandlerCandidates(document)
            logger.debug('makeTypescriptCodeLensProvider handlers:', JSON.stringify(handlers, undefined, 2))

            return makeCodeLenses({
                document,
                handlers,
                token,
                runtimeFamily: RuntimeFamily.NodeJS,
            })
        },
    }
}

export async function initializePythonCodelens(context: ExtContext): Promise<void> {
    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand(
            getInvokeCmdKey('python'),
            async (params: LambdaLocalInvokeParams): Promise<void> => {
                // TODO: restore or remove
            }
        )
    )
}

export async function initializeCsharpCodelens(context: ExtContext): Promise<void> {
    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand(
            getInvokeCmdKey(csharpCodelens.CSHARP_LANGUAGE),
            async (params: LambdaLocalInvokeParams) => {
                // await csharpDebug.invokeCsharpLambda({
                //     ctx: context,
                //     config: undefined,
                //     lambdaLocalInvokeParams: params,
                // })
            }
        )
    )
}

/**
 * LEGACY/DEPRECATED codelens-based debug entrypoint.
 */
export function initializeTypescriptCodelens(context: ExtContext): void {
    // const processInvoker = new DefaultValidatingSamCliProcessInvoker({}),
    // const localInvokeCommand = new DefaultSamLocalInvokeCommand(getChannelLogger(context.outputChannel), [
    //     WAIT_FOR_DEBUGGER_MESSAGES.NODEJS
    // ])
    const invokeLambda = async (params: LambdaLocalInvokeParams & { runtime: string }) => {
        // const samProjectCodeRoot = await getSamProjectDirPathForFile(params.uri.fsPath)
        // let debugPort: number | undefined
        // if (params.isDebug) {
        //     debugPort = await getStartPort()
        // }
        // const debugConfig: NodejsDebugConfiguration = {
        //     type: 'node',
        //     request: 'attach',
        //     name: 'SamLocalDebug',
        //     preLaunchTask: undefined,
        //     address: 'localhost',
        //     port: debugPort!,
        //     localRoot: samProjectCodeRoot,
        //     remoteRoot: '/var/task',
        //     protocol: 'inspector',
        //     skipFiles: ['/var/runtime/node_modules/**/*.js', '<node_internals>/**/*.js']
        // }
        // const localLambdaRunner: LocalLambdaRunner = new LocalLambdaRunner(
        //     configuration,
        //     params,
        //     debugPort,
        //     params.runtime,
        //     toolkitOutputChannel,
        //     processInvoker,
        //     localInvokeCommand,
        //     debugConfig,
        //     samProjectCodeRoot,
        //     telemetryService
        // )
        // await localLambdaRunner.run()
    }

    const command = getInvokeCmdKey('javascript')
    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand(command, async (params: LambdaLocalInvokeParams) => {
            const logger = getLogger()

            const resource = await CloudFormation.getResourceFromTemplate({
                handlerName: params.handlerName,
                templatePath: params.samTemplate.fsPath,
            })
            const template = await CloudFormation.load(params.samTemplate.fsPath)
            const lambdaRuntime = CloudFormation.getRuntime(resource, template)
            let invokeResult: Result = 'Succeeded'
            try {
                if (!nodeJsRuntimes.has(lambdaRuntime)) {
                    invokeResult = 'Failed'
                    logger.error(
                        `Javascript local invoke on ${params.uri.fsPath} encountered` +
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
                        ...params,
                    })
                }
            } catch (err) {
                invokeResult = 'Failed'
                throw err
            } finally {
                recordLambdaInvokeLocal({
                    result: invokeResult,
                    runtime: lambdaRuntime as Runtime,
                    debug: params.isDebug,
                })
            }
        })
    )
}
