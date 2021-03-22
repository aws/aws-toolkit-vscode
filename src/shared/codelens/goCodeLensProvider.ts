/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { findParentProjectFile } from '../utilities/workspaceUtils'

export const GO_LANGUAGE = 'go'
export const GO_ALLFILES: vscode.DocumentFilter[] = [
    {
        scheme: 'file',
        language: GO_LANGUAGE,
    },
]

// Need to check for different Go package managers...
// go.mod???
export const GO_BASE_PATTERN = '**/*.mod'

// func, package, const, interface, Struct, Var, Type
const REGEXP_RESERVED_WORD_FUNC = /\bfunc\b/

export interface GoLambdaHandlerComponents {
    module: string
    func: string
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
                manifestUri: assemblyUri,
                range: lambdaHandlerComponents.handlerRange,
            }
        }
    )
}

export function getLambdaHandlerComponents(
    document: vscode.TextDocument,
    symbols: vscode.DocumentSymbol[],
    assembly: string
): GoLambdaHandlerComponents[] {
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

        return REGEXP_RESERVED_WORD_PUBLIC.test(classDeclarationBeforeName)
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
    // We will ignore functions declared outside the global scope for now, though this could be changed
    if (symbol.kind === vscode.SymbolKind.Function && symbol.range.start.character === 0) {
        // Reference: https://docs.aws.amazon.com/lambda/latest/dg/golang-handler.html
        // valid lambda handlers in Go can have between 0 and 2 arguments
        // if there are arguments then the first must implement context.Context
        // handlers should return between 0 and 2 arguments, if there is 1 arg then it should implement error
        // if there are 2 args then the 2nd should implement error
        // example: func foo(ctx contex.Contex, name Bar) (string, error)
        const signatureBeforeFuncNameRange = new vscode.Range(symbol.range.start, symbol.selectionRange.start)
        const signatureBeforeFuncName: string = document.getText(signatureBeforeFuncNameRange)

        if (REGEXP_RESERVED_WORD_FUNC.test(signatureBeforeFuncName)) {
            return isValidFuncSignature(symbol)
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
export function isValidFuncSignature(symbol: vscode.DocumentSymbol): boolean {
    const argsRegExp = /\(.*\)/
    const lambdaContextType = 'context'
    const lambdaErrorType = 'error'

    if (symbol.kind === vscode.SymbolKind.Function) {
        // collects the parameters and the return arguments for the handler
        const argsArr = argsRegExp.exec(symbol.name)
        // reject if there are no parameters
        if (!argsArr) {
            return false
        }
        // split into parameter args and return args (check for naked returns)
        const paramArgs: string[] = argsArr[0].split(',')
        const returnArgs: string[] = argsArr.length == 2 ? argsArr[1].split(',') : []

        if (paramArgs.length > 2 || returnArgs.length > 2) {
            return false
        }
    }

    return false
}

export function generateGoLambdaHandler(components: GoLambdaHandlerComponents): string {
    return `${components.module}::${components.func}`
}
