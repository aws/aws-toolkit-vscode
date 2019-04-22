/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as path from 'path'
import * as vscode from 'vscode'

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
import { getChannelLogger } from '../utilities/vsCodeUtils'
import {
    CodeLensProviderParams,
    getInvokeCmdKey,
    getMetricDatum,
    makeCodeLenses,
} from './codeLensUtils'
import {
    executeSamBuild,
    getHandlerRelativePath,
    getLambdaInfoFromExistingTemplate,
    getRelativeFunctionHandler,
    getRuntimeForLambda,
    invokeLambdaFunction,
    LambdaLocalInvokeParams,
    makeBuildDir,
    makeInputTemplate
} from './localLambdaRunner'

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
    telemetryService
}: {
    configuration: SettingsConfiguration
    toolkitOutputChannel: vscode.OutputChannel,
    commandName: string,
    lambdaLocalInvokeParams: LambdaLocalInvokeParams,
    processInvoker: SamCliProcessInvoker,
    taskInvoker: SamCliTaskInvoker,
    telemetryService: TelemetryService
}): Promise<{ datum: Datum }> {

    const channelLogger = getChannelLogger(toolkitOutputChannel)
    const runtime = await getRuntimeForLambda({
        handlerName: lambdaLocalInvokeParams.handlerName,
        templatePath: lambdaLocalInvokeParams.samTemplate.fsPath
    })

    // Switch over to the output channel so the user has feedback that we're getting things ready
    channelLogger.channel.show(true)

    channelLogger.info(
        'AWS.output.sam.local.start',
        'Preparing to run {0} locally...',
        lambdaLocalInvokeParams.handlerName
    )

    try {
        if (!lambdaLocalInvokeParams.isDebug) {
            const baseBuildDir = await makeBuildDir()
            const templateDir = path.dirname(lambdaLocalInvokeParams.samTemplate.fsPath)
            const documentUri = lambdaLocalInvokeParams.document.uri
            const handlerName = lambdaLocalInvokeParams.handlerName

            const handlerFileRelativePath = getHandlerRelativePath({
                codeRoot: templateDir,
                filePath: documentUri.fsPath
            })

            const lambdaInfo = await getLambdaInfoFromExistingTemplate({
                workspaceUri: lambdaLocalInvokeParams.workspaceFolder.uri,
                originalHandlerName: handlerName,
                runtime,
                handlerFileRelativePath
            })

            const relativeFunctionHandler = getRelativeFunctionHandler({
                handlerName,
                runtime,
                handlerFileRelativePath
            })

            const inputTemplatePath = await makeInputTemplate({
                baseBuildDir,
                codeDir: lambdaInfo && lambdaInfo.codeUri ?
                    path.join(templateDir, lambdaInfo.codeUri) : templateDir,
                relativeFunctionHandler,
                properties: lambdaInfo && lambdaInfo.resource.Properties ? lambdaInfo.resource.Properties : undefined,
                runtime
            })

            const samTemplatePath: string = await executeSamBuild({
                baseBuildDir,
                channelLogger,
                codeDir: (lambdaInfo && lambdaInfo.codeUri ? path.join(templateDir, lambdaInfo.codeUri) : templateDir),
                inputTemplatePath,
                samProcessInvoker: processInvoker,
            })

            await invokeLambdaFunction({
                baseBuildDir,
                channelLogger,
                configuration,
                documentUri,
                originalHandlerName: handlerName,
                handlerName,
                originalSamTemplatePath: inputTemplatePath,
                samTemplatePath,
                samTaskInvoker: taskInvoker,
                telemetryService,
                runtime,
                isDebug: lambdaLocalInvokeParams.isDebug,

                // TODO: Set on debug
                debugConfig: undefined,
            })
        } else {
            vscode.window.showInformationMessage(`Local debug for ${runtime} is currently not implemented.`)
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
