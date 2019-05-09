/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as crossSpawn from 'cross-spawn'
import * as del from 'del'
import * as fs from 'fs'
import * as path from 'path'
import * as util from 'util'
import * as vscode from 'vscode'

import { makeCoreCLRDebugConfiguration } from '../../lambda/local/debugConfiguration'
import { CloudFormation } from '../cloudformation/cloudformation'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { getLogger } from '../logger'
import {
    DefaultSamCliProcessInvoker,
    DefaultSamCliTaskInvoker
} from '../sam/cli/samCliInvoker'
import { SamCliProcessInvoker, SamCliTaskInvoker } from '../sam/cli/samCliInvokerUtils'
import { SettingsConfiguration } from '../settingsConfiguration'
import { Datum } from '../telemetry/telemetryEvent'
import { TelemetryService } from '../telemetry/telemetryService'
import { registerCommand } from '../telemetry/telemetryUtils'
import { dirnameWithTrailingSlash } from '../utilities/pathUtils'
import { getChannelLogger, getDebugPort } from '../utilities/vsCodeUtils'
import {
    CodeLensProviderParams,
    getInvokeCmdKey,
    getMetricDatum,
    makeCodeLenses,
} from './codeLensUtils'
import {
    executeSamBuild,
    ExecuteSamBuildArguments,
    invokeLambdaFunction,
    InvokeLambdaFunctionArguments,
    InvokeLambdaFunctionContext,
    LambdaLocalInvokeParams,
    makeBuildDir,
    makeInputTemplate,
} from './localLambdaRunner'

const access = util.promisify(fs.access)
const mkdir = util.promisify(fs.mkdir)

export const CSHARP_LANGUAGE = 'csharp'
export const CSHARP_ALLFILES: vscode.DocumentFilter[] = [
    {
        scheme: 'file',
        language: CSHARP_LANGUAGE
    }
]

const REGEXP_RESERVED_WORD_PUBLIC = /\bpublic\b/

export interface DotNetLambdaHandlerComponents {
    assembly: string,
    namespace: string,
    class: string,
    method: string,
    // Range of the function representing the Lambda Handler
    handlerRange: vscode.Range,
}

export async function initialize({
    configuration,
    outputChannel: toolkitOutputChannel,
    processInvoker = new DefaultSamCliProcessInvoker(),
    taskInvoker = new DefaultSamCliTaskInvoker(),
    telemetryService
}: CodeLensProviderParams): Promise<void> {
    const command = getInvokeCmdKey(CSHARP_LANGUAGE)
    registerCommand({
        command,
        callback: async (params: LambdaLocalInvokeParams): Promise<{ datum: Datum }> => {
            return await onLocalInvokeCommand({
                commandName: command,
                lambdaLocalInvokeParams: params,
                configuration,
                toolkitOutputChannel,
                processInvoker,
                taskInvoker,
                telemetryService
            })
        },
    })
}

/**
 * The command that is run when user clicks on Run Local or Debug Local CodeLens
 * Accepts object containing the following params:
 * @param configuration - SettingsConfiguration (for invokeLambdaFunction)
 * @param toolkitOutputChannel - "AWS Toolkit" output channel
 * @param commandName - Name of the VS Code Command currently running
 * @param lambdaLocalInvokeParams - Information about the Lambda Handler to invoke locally
 * @param processInvoker - SAM CLI Process invoker
 * @param taskInvoker - SAM CLI Task invoker
 * @param telemetryService - Telemetry service for metrics
 */
async function onLocalInvokeCommand({
    configuration,
    toolkitOutputChannel,
    commandName,
    lambdaLocalInvokeParams,
    processInvoker,
    taskInvoker,
    telemetryService,
    getResourceFromTemplate = async _args => await CloudFormation.getResourceFromTemplate(_args),
}: {
    configuration: SettingsConfiguration
    toolkitOutputChannel: vscode.OutputChannel,
    commandName: string,
    lambdaLocalInvokeParams: LambdaLocalInvokeParams,
    processInvoker: SamCliProcessInvoker,
    taskInvoker: SamCliTaskInvoker,
    telemetryService: TelemetryService,
    getResourceFromTemplate?(args: {
        templatePath: string,
        handlerName: string
    }): Promise<CloudFormation.Resource>,
}): Promise<{ datum: Datum }> {
    const channelLogger = getChannelLogger(toolkitOutputChannel)
    const resource = await getResourceFromTemplate({
        templatePath: lambdaLocalInvokeParams.samTemplate.fsPath,
        handlerName: lambdaLocalInvokeParams.handlerName,
    })
    const runtime = CloudFormation.getRuntime(resource)

    try {
        // Switch over to the output channel so the user has feedback that we're getting things ready
        channelLogger.channel.show(true)
        channelLogger.info(
            'AWS.output.sam.local.start',
            'Preparing to run {0} locally...',
            lambdaLocalInvokeParams.handlerName
        )

        const baseBuildDir = await makeBuildDir()
        const codeDir = path.dirname(lambdaLocalInvokeParams.document.uri.fsPath)
        const documentUri = lambdaLocalInvokeParams.document.uri
        const handlerName = lambdaLocalInvokeParams.handlerName

        const inputTemplatePath = await makeInputTemplate({
            baseBuildDir,
            codeDir,
            relativeFunctionHandler: handlerName,
            runtime,
        })

        const buildArgs: ExecuteSamBuildArguments = {
            baseBuildDir,
            channelLogger,
            codeDir,
            inputTemplatePath,
            samProcessInvoker: processInvoker,
        }
        if (lambdaLocalInvokeParams.isDebug) {
            buildArgs.environmentVariables = {
                SAM_BUILD_MODE: 'debug'
            }
        }
        const samTemplatePath: string = await executeSamBuild(buildArgs)

        const invokeArgs: InvokeLambdaFunctionArguments = {
            baseBuildDir,
            documentUri,
            originalHandlerName: handlerName,
            handlerName,
            originalSamTemplatePath: inputTemplatePath,
            samTemplatePath,
            runtime,
        }

        const invokeContext: InvokeLambdaFunctionContext = {
            channelLogger,
            configuration,
            taskInvoker,
            telemetryService
        }

        if (!lambdaLocalInvokeParams.isDebug) {
            await invokeLambdaFunction(
                invokeArgs,
                invokeContext
            )
        } else {
            const codeUri = path.join(
                path.dirname(lambdaLocalInvokeParams.samTemplate.fsPath),
                CloudFormation.getCodeUri(resource)
            )
            const debuggerPath = await installDebugger({
                runtime,
                codeUri
            })
            const port = await getDebugPort()
            const debugConfig = makeCoreCLRDebugConfiguration({
                port,
                codeUri
            })

            await invokeLambdaFunction(
                {
                    ...invokeArgs,
                    debugArgs: {
                        debugConfig,
                        debugPort: port,
                        debuggerPath
                    }
                },
                invokeContext
            )
        }
    } catch (err) {
        const error = err as Error
        channelLogger.error(
            'AWS.error.during.sam.local',
            'An error occurred trying to run SAM Application locally: {0}',
            error
        )
    }

    return getMetricDatum({
        isDebug: lambdaLocalInvokeParams.isDebug,
        command: commandName,
        runtime,
    })
}

export async function makeCSharpCodeLensProvider(): Promise<vscode.CodeLensProvider> {
    const logger = getLogger()

    const codeLensProvider: vscode.CodeLensProvider = {
        provideCodeLenses: async (
            document: vscode.TextDocument,
            token: vscode.CancellationToken
        ): Promise<vscode.CodeLens[]> => {
            const handlers: LambdaHandlerCandidate[] = await getLambdaHandlerCandidates(document)
            logger.debug(
                'csharpCodeLensProvider.makeCSharpCodeLensProvider handlers:',
                JSON.stringify(handlers, undefined, 2)
            )

            return makeCodeLenses({
                document,
                handlers,
                token,
                language: 'csharp'
            })
        }
    }

    return codeLensProvider
}

export async function getLambdaHandlerCandidates(document: vscode.TextDocument): Promise<LambdaHandlerCandidate[]> {
    const assemblyName = await getAssemblyName(document.uri)
    if (!assemblyName) {
        return []
    }

    const symbols: vscode.DocumentSymbol[] = (
        (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        )) || []
    )

    return getLambdaHandlerComponents(document, symbols, assemblyName)
        .map<LambdaHandlerCandidate>(lambdaHandlerComponents => {
            const handlerName = generateDotNetLambdaHandler(lambdaHandlerComponents)

            return {
                filename: document.uri.fsPath,
                handlerName,
                range: lambdaHandlerComponents.handlerRange,
            }
        })
}

async function getAssemblyName(sourceCodeUri: vscode.Uri): Promise<string | undefined> {
    const projectFile: vscode.Uri | undefined = await findParentProjectFile(sourceCodeUri)

    if (!projectFile) {
        return undefined
    }

    // TODO : Perform an XPATH parse on the project file
    // If Project/PropertyGroup/AssemblyName exists, use that. Otherwise use the file name.

    return path.parse(projectFile.fsPath).name
}

export function getLambdaHandlerComponents(
    document: vscode.TextDocument,
    symbols: vscode.DocumentSymbol[],
    assembly: string,
): DotNetLambdaHandlerComponents[] {
    return symbols
        .filter(symbol => symbol.kind === vscode.SymbolKind.Namespace)
        // Find relevant classes within the namespace
        .reduce<{
            namespace: vscode.DocumentSymbol,
            class: vscode.DocumentSymbol,
        }[]>(
            (accumulator, namespaceSymbol: vscode.DocumentSymbol) => {
                accumulator.push(...namespaceSymbol.children
                    .filter(namespaceChildSymbol => namespaceChildSymbol.kind === vscode.SymbolKind.Class)
                    .filter(classSymbol => isPublicClassSymbol(document, classSymbol))
                    .map(classSymbol => {
                        return {
                            namespace: namespaceSymbol,
                            class: classSymbol,
                        }
                    })
                )

                return accumulator
            },
            []
        )
        // Find relevant methods within each class
        .reduce<DotNetLambdaHandlerComponents[]>(
            (accumulator, lambdaHandlerComponents) => {
                accumulator.push(...lambdaHandlerComponents.class.children
                    .filter(classChildSymbol => classChildSymbol.kind === vscode.SymbolKind.Method)
                    .filter(methodSymbol => isPublicMethodSymbol(document, methodSymbol))
                    .map(methodSymbol => {
                        return {
                            assembly,
                            namespace: lambdaHandlerComponents.namespace.name,
                            class: document.getText(lambdaHandlerComponents.class.selectionRange),
                            method: document.getText(methodSymbol.selectionRange),
                            handlerRange: methodSymbol.range,
                        }
                    })
                )

                return accumulator
            },
            []
        )
}

export async function findParentProjectFile(
    sourceCodeUri: vscode.Uri,
    findWorkspaceFiles: typeof vscode.workspace.findFiles = vscode.workspace.findFiles,
): Promise<vscode.Uri | undefined> {
    const workspaceProjectFiles: vscode.Uri[] = await findWorkspaceFiles(
        '**/*.csproj'
    )

    // Use the project file "closest" in the parent chain to sourceCodeUri
    // Assumption: only one .csproj file will exist in a given folder
    const parentProjectFiles = workspaceProjectFiles
        .filter(uri => {
            const dirname = dirnameWithTrailingSlash(uri.fsPath)

            return sourceCodeUri.fsPath.startsWith(dirname)
        })
        .sort()
        .reverse()

    return parentProjectFiles.length === 0 ? undefined : parentProjectFiles[0]
}

export function isPublicClassSymbol(
    document: Pick<vscode.TextDocument, 'getText'>,
    symbol: vscode.DocumentSymbol,
): boolean {
    if (symbol.kind === vscode.SymbolKind.Class) {
        // from "public class Processor" pull "public class "
        const classDeclarationBeforeNameRange = new vscode.Range(symbol.range.start, symbol.selectionRange.start)
        const classDeclarationBeforeName: string = document.getText(classDeclarationBeforeNameRange)

        return REGEXP_RESERVED_WORD_PUBLIC.test(classDeclarationBeforeName)
    }

    return false
}

export function isPublicMethodSymbol(
    document: Pick<vscode.TextDocument, 'getText'>,
    symbol: vscode.DocumentSymbol,
): boolean {
    if (symbol.kind === vscode.SymbolKind.Method) {
        // from "public async Task<Response> foo()" pull "public async Task<Response> "
        const signatureBeforeMethodNameRange = new vscode.Range(symbol.range.start, symbol.selectionRange.start)
        const signatureBeforeMethodName: string = document.getText(signatureBeforeMethodNameRange)

        return REGEXP_RESERVED_WORD_PUBLIC.test(signatureBeforeMethodName)
    }

    return false
}

export function generateDotNetLambdaHandler(components: DotNetLambdaHandlerComponents): string {
    return `${components.assembly}::${components.namespace}.${components.class}::${components.method}`
}

export async function installDebugger({
    runtime,
    codeUri
}: {
    runtime: string,
    codeUri: string
}): Promise<string> {
    const vsdbgPath = path.resolve(codeUri, '.vsdbg')

    try {
        await access(vsdbgPath)

         // vsdbg is already installed.
        return vsdbgPath
    } catch {
        // We could not access vsdbgPath. Swallow error and continue.
    }

    try {
        await mkdir(vsdbgPath)

        const process = crossSpawn(
            'docker',
            [
                'run',
                '--rm',
                '--mount',
                `type=bind,src=${vsdbgPath},dst=/vsdbg`,
                '--entrypoint',
                'bash',
                `lambci/lambda:${runtime}`,
                '-c',
                '"curl -sSL https://aka.ms/getvsdbgsh | bash /dev/stdin -v latest -l /vsdbg"'
            ],
            {
                windowsVerbatimArguments: true
            }
        )

        await new Promise<void>((resolve, reject) => {
            process.once('close', (code, signal) => {
                if (code === 0) {
                    resolve()
                } else {
                    reject(signal)
                }
            })
        })
    } catch (err) {
        // Clean up to avoid leaving a bad installation in the user's workspace.
        await del(vsdbgPath, { force: true })
        throw err
    }

    return vsdbgPath
}
