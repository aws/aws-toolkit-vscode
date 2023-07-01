/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { findParentProjectFile } from '../utilities/workspaceUtils'

export const csharpLanguage = 'csharp'
export const csharpAllfiles: vscode.DocumentFilter[] = [
    {
        scheme: 'file',
        language: csharpLanguage,
    },
]
export const csharpBasePattern = '**/*.csproj'

const regexpReservedWordPublic = /\bpublic\b/

export interface DotNetLambdaHandlerComponents {
    assembly: string
    namespace: string
    class: string
    method: string
    // Range of the function representing the Lambda Handler
    handlerRange: vscode.Range
}

export async function getLambdaHandlerCandidates(document: vscode.TextDocument): Promise<LambdaHandlerCandidate[]> {
    // Limitation: If more than one .csproj file exists in the same directory,
    // and the directory is the closest to the source file, the csproj file used will be random

    // TODO : Perform an XPATH parse on the project file
    // If Project/PropertyGroup/AssemblyName exists, use that. Otherwise use the file name.
    const assemblyUri = await findParentProjectFile(document.uri, /^.*\.csproj$/)
    if (!assemblyUri) {
        return []
    }
    const assemblyName = path.parse(assemblyUri.fsPath).name

    const symbols: vscode.DocumentSymbol[] =
        (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        )) || []

    return getLambdaHandlerComponents(document, symbols, assemblyName).map<LambdaHandlerCandidate>(
        lambdaHandlerComponents => {
            const handlerName = generateDotNetLambdaHandler(lambdaHandlerComponents)

            return {
                filename: document.uri.fsPath,
                handlerName,
                rootUri: assemblyUri,
                range: lambdaHandlerComponents.handlerRange,
            }
        }
    )
}

export function getLambdaHandlerComponents(
    document: vscode.TextDocument,
    symbols: vscode.DocumentSymbol[],
    assembly: string
): DotNetLambdaHandlerComponents[] {
    return (
        symbols
            .filter(symbol => symbol.kind === vscode.SymbolKind.Namespace)
            // Find relevant classes within the namespace
            .reduce<
                {
                    namespace: vscode.DocumentSymbol
                    class: vscode.DocumentSymbol
                }[]
            >((accumulator, namespaceSymbol: vscode.DocumentSymbol) => {
                accumulator.push(
                    ...namespaceSymbol.children
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
            }, [])
            // Find relevant methods within each class
            .reduce<DotNetLambdaHandlerComponents[]>((accumulator, lambdaHandlerComponents) => {
                accumulator.push(
                    ...lambdaHandlerComponents.class.children
                        .filter(classChildSymbol => classChildSymbol.kind === vscode.SymbolKind.Method)
                        .filter(methodSymbol => isValidLambdaHandler(document, methodSymbol))
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
            }, [])
    )
}

export function isPublicClassSymbol(
    document: Pick<vscode.TextDocument, 'getText'>,
    symbol: vscode.DocumentSymbol
): boolean {
    if (symbol.kind === vscode.SymbolKind.Class) {
        // from "public class Processor" pull "public class "
        const classDeclarationBeforeNameRange = new vscode.Range(symbol.range.start, symbol.selectionRange.start)
        const classDeclarationBeforeName: string = document.getText(classDeclarationBeforeNameRange)

        return regexpReservedWordPublic.test(classDeclarationBeforeName)
    }

    return false
}

/**
 * Returns whether or not a method is a valid Lambda handler
 * @param document VS Code document
 * @param symbol VS Code DocumentSymbol to evaluate
 */
export function isValidLambdaHandler(
    document: Pick<vscode.TextDocument, 'getText'>,
    symbol: vscode.DocumentSymbol
): boolean {
    if (symbol.kind === vscode.SymbolKind.Method) {
        // from "public async Task<Response> foo()" pull "public async Task<Response> "
        const signatureBeforeMethodNameRange = new vscode.Range(symbol.range.start, symbol.selectionRange.start)
        const signatureBeforeMethodName: string = document.getText(signatureBeforeMethodNameRange)

        if (regexpReservedWordPublic.test(signatureBeforeMethodName)) {
            return isValidMethodSignature(symbol)
        }
    }

    return false
}

/**
 * Returns whether or not a VS Code DocumentSymbol is a method that could be a Lambda handler
 * * has one or more parameters
 * * if there is more than one parameter, the second parameter is an ILambdaContext object
 *   * does not check for extension/implementation of ILambdaContext
 * @param symbol VS Code DocumentSymbol to analyze
 */
export function isValidMethodSignature(symbol: vscode.DocumentSymbol): boolean {
    const parametersRegExp = /\(.*\)/
    const lambdaContextType = 'ILambdaContext '

    if (symbol.kind === vscode.SymbolKind.Method) {
        // public void methodName(Foo<Bar, Baz> x, ILambdaContext y) -> (Foo<Bar, Baz> x, ILambdaContext y)
        const parametersArr = parametersRegExp.exec(symbol.name)
        // reject if there are no parameters
        if (!parametersArr) {
            return false
        }
        // remove generics from parameter string so we can do a predictable split on comma
        const strippedStr = stripGenericsFromParams(parametersArr[0])
        const individualParams = strippedStr.split(',')
        if (individualParams.length === 1 || individualParams[1].valueOf().trimLeft().startsWith(lambdaContextType)) {
            return true
        }
    }

    return false
}

/**
 * Strips any generics from a string in order to ensure predictable commas for a string of parameters.
 * e.g.: `'(Foo<Bar, Baz> x, ILambdaContext y)' -> '(Foo x, ILambdaContext y)'`
 * Implements a fairly rough English-centric approximation of the C# identifier spec:
 * * can start with a letter, underscore, or @ sign
 * * all other characters are letters, numbers, underscores, or periods
 *
 * Actual spec: https://docs.microsoft.com/en-us/dotnet/csharp/language-reference/language-specification/lexical-structure#identifiers
 * @param input String to remove generics from
 */
function stripGenericsFromParams(input: string): string {
    const cSharpGenericIdentifierRegex = /(?:<{1}(?:\s*[a-zA-Z_@][a-zA-Z0-9._]*[\s,]?)*>{1})/g

    return input.replace(cSharpGenericIdentifierRegex, '')
}

export function generateDotNetLambdaHandler(components: DotNetLambdaHandlerComponents): string {
    return `${components.assembly}::${components.namespace}.${components.class}::${components.method}`
}
