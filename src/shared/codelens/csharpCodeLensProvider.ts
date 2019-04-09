/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as path from 'path'
import * as vscode from 'vscode'

import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { getLogger } from '../logger'
import { Datum } from '../telemetry/telemetryEvent'
import { registerCommand } from '../telemetry/telemetryUtils'
import { dirnameWithTrailingSlash } from '../utilities/pathUtils'
import {
    CodeLensProviderParams,
    getInvokeCmdKey,
    getMetricDatum,
    makeCodeLenses,
} from './codeLensUtils'
import {
    getRuntimeForLambda,
    LambdaLocalInvokeParams,
} from './localLambdaRunner'

export const CSHARP_LANGUAGE = 'csharp'
export const CSHARP_ALLFILES: vscode.DocumentFilter[] = [
    {
        scheme: 'file',
        language: CSHARP_LANGUAGE
    }
]

const REGEXP_RESERVED_WORD_PUBLIC = new RegExp(/\bpublic\b/)

export interface DotNetHandlerSymbolsTuplet {
    namespace: vscode.DocumentSymbol,
    class: vscode.DocumentSymbol,
    className: string,
    method: vscode.DocumentSymbol,
    methodName: string,
}

export async function initialize({
}: CodeLensProviderParams): Promise<void> {
    const command = getInvokeCmdKey(CSHARP_LANGUAGE)
    registerCommand({
        command,
        callback: async (params: LambdaLocalInvokeParams): Promise<{ datum: Datum }> => {
            return await onLocalInvokeCommand({
                commandName: command,
                lambdaLocalInvokeParams: params,
            })
        },
    })
}

/**
 * The command that is run when user clicks on Run Local or Debug Local CodeLens
 * @param commandName - Name of the VS Code Command currently running
 * @param lambdaLocalInvokeParams - Information about the Lambda Handler to invoke locally
 */
async function onLocalInvokeCommand({
    commandName,
    lambdaLocalInvokeParams,
}: {
    commandName: string,
    lambdaLocalInvokeParams: LambdaLocalInvokeParams,
}): Promise<{ datum: Datum }> {

    const runtime = await getRuntimeForLambda({
        handlerName: lambdaLocalInvokeParams.handlerName,
        templatePath: lambdaLocalInvokeParams.samTemplate.fsPath
    })

    // TODO : Implement local run/debug in future backlog tasks
    vscode.window.showInformationMessage(
        `Local ${lambdaLocalInvokeParams.isDebug ? 'debug' : 'run'} support for csharp is currently not implemented.`
    )

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

    return getLambdaHandlerSymbolsTuplets(document, symbols)
        .map<LambdaHandlerCandidate>(tuplet => {
            const handlerName = produceHandlerName(assemblyName, tuplet)

            return {
                filename: document.uri.fsPath,
                handlerName,
                range: tuplet.method.range,
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

export function getLambdaHandlerSymbolsTuplets(
    document: vscode.TextDocument,
    symbols: vscode.DocumentSymbol[],
): DotNetHandlerSymbolsTuplet[] {
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
                    .filter(methodSymbol => isPublicClassSymbol(document, methodSymbol))
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
        .reduce<DotNetHandlerSymbolsTuplet[]>(
            (accumulator, tuplet) => {
                accumulator.push(...tuplet.class.children
                    .filter(classChildSymbol => classChildSymbol.kind === vscode.SymbolKind.Method)
                    .filter(methodSymbol => isPublicMethodSymbol(document, methodSymbol))
                    .map(methodSymbol => {
                        return {
                            namespace: tuplet.namespace,
                            class: tuplet.class,
                            className: document.getText(tuplet.class.selectionRange),
                            method: methodSymbol,
                            methodName: document.getText(methodSymbol.selectionRange),
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

export function produceHandlerName(assemblyName: string, tuplet: DotNetHandlerSymbolsTuplet): string {
    return `${assemblyName}::${tuplet.className}::${tuplet.methodName}`
}
