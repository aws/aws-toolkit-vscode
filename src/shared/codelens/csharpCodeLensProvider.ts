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

const METHOD_SYMBOL_NAME_REGEXP = new RegExp(/\w*/)
const METHOD_SYMBOL_PUBLIC_REGEXP = new RegExp(/\bpublic\b/)

export interface DotNetHandlerSymbolsTuplet {
    namespace: vscode.DocumentSymbol,
    class: vscode.DocumentSymbol,
    method: vscode.DocumentSymbol,
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
                'csharpCodeLensProvider.makePythonCodeLensProvider handlers:',
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
                    .filter(methodSymbol => getMethodNameFromSymbol(methodSymbol) !== undefined)
                    .filter(methodSymbol => isPublicMethodSymbol(document, methodSymbol))
                    .map(methodSymbol => {
                        return {
                            namespace: tuplet.namespace,
                            class: tuplet.class,
                            method: methodSymbol,
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
        const methodText: string = document.getText(symbol.range)

        // Find the position of the 'class' keyword
        const classPosition = methodText.indexOf('class')

        if (classPosition !== -1) {
            const classDecorationPrefix = methodText.substr(0, classPosition)

            return METHOD_SYMBOL_PUBLIC_REGEXP.test(classDecorationPrefix)
        }
    }

    return false
}

export function isPublicMethodSymbol(
    document: Pick<vscode.TextDocument, 'getText'>,
    symbol: vscode.DocumentSymbol,
): boolean {
    if (symbol.kind === vscode.SymbolKind.Method) {
        const methodText: string = document.getText(symbol.range)

        const methodName = getMethodNameFromSymbol(symbol)

        if (!methodName) {
            return false
        }

        // Look for the method name
        const methodNameRegex = new RegExp(`\\b${methodName}\\b`)

        // public async foo() -> "public async "
        const signaturePosition = methodText.search(methodNameRegex)

        if (signaturePosition === -1) {
            const logger = getLogger()

            const err = new Error(
                `Unable to find function signature: ${methodName}`
            )

            logger.error(err)
            throw err
        }

        const signatureBeforeMethodName = methodText.substr(0, signaturePosition)

        return METHOD_SYMBOL_PUBLIC_REGEXP.test(signatureBeforeMethodName)
    }

    return false
}

export function getMethodNameFromSymbol(symbol: vscode.DocumentSymbol): string | undefined {
    if (symbol.kind === vscode.SymbolKind.Method) {
        const matches = symbol.name.match(METHOD_SYMBOL_NAME_REGEXP)

        if (matches && matches.length > 0) {
            return matches[0]
        }
    }

    return undefined
}

export function produceHandlerName(assemblyName: string, tuplet: DotNetHandlerSymbolsTuplet): string {
    if (tuplet.class && tuplet.method) {
        const methodName: string | undefined = getMethodNameFromSymbol(tuplet.method)

        if (!methodName) {
            throw new Error('Method name missing from symbol')
        }

        return `${assemblyName}::${tuplet.class.name}::${methodName}`
    }

    throw new Error('Missing symbol data')
}
