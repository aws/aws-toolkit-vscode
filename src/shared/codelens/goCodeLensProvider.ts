/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import { doc } from 'prettier'
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
export const GO_BASE_PATTERN = '**/go.mod'

// func, package, const, interface, Struct, Var, Type
const REGEXP_RESERVED_WORD_FUNC = /\bfunc\b/

export async function getLambdaHandlerCandidates(document: vscode.TextDocument): Promise<LambdaHandlerCandidate[]> {
    const requirementsFile = await findParentProjectFile(document.uri, /go.mod/)
    if (!requirementsFile) {
        return []
    }
    const filename = document.uri.fsPath
    const symbols: vscode.DocumentSymbol[] =
        (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        )) ?? []

    return symbols
        .filter(symbol => isValidLambdaHandler(document, symbol))
        .map<LambdaHandlerCandidate>(symbol => {
            return {
                filename,
                handlerName: `${document.uri}.${symbol.name}`,
                manifestUri: requirementsFile,
                range: symbol.range,
            }
        })
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
    const argsRegExp = /\(.*?\)/

    if (symbol.kind === vscode.SymbolKind.Function) {
        // collects the parameters (vscode details does not have the return signature)
        const parameters = argsRegExp.exec(symbol.detail)

        // reject if there are no parameters
        if (!parameters) {
            return false
        }
        // split into parameter args and return args (check for naked returns)
        const paramArgs: string[] = parameters[0].split(',')

        if (paramArgs.length > 2) {
            return false
        }

        return true
    }

    return false
}
