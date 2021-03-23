/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

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

export async function getLambdaHandlerCandidates(document: vscode.TextDocument): Promise<LambdaHandlerCandidate[]> {
    const modFile = await findParentProjectFile(document.uri, /go.mod/)
    if (!modFile) {
        return []
    }
    const filename = document.uri.fsPath
    const symbols: vscode.DocumentSymbol[] =
        (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        )) ?? []

    return symbols
        .filter(symbol => isValidFuncSignature(document, symbol))
        .map<LambdaHandlerCandidate>(symbol => {
            return {
                filename,
                handlerName: `${document.uri}.${symbol.name}`,
                manifestUri: modFile,
                range: symbol.range,
            }
        })
}

/**
 * Returns whether or not a VS Code DocumentSymbol is a method that could be a Lambda handler
 * * has one or more parameters
 * * if there is more than one parameter, the second parameter is an ILambdaContext object
 *   * does not check for extension/implementation of ILambdaContext
 * @param symbol VS Code DocumentSymbol to analyze
 */
export function isValidFuncSignature(document: vscode.TextDocument, symbol: vscode.DocumentSymbol): boolean {
    const argsRegExp = /\(.*?\)/

    if (symbol.kind === vscode.SymbolKind.Function && symbol.range.start.character == 0) {
        // collects the parameters, vscode details does not have the return signature :(
        const parameters = argsRegExp.exec(symbol.detail)

        // reject if there are no parameters
        if (!parameters) {
            return false
        }
        // split into parameter args and return args
        const paramArgs: string[] = parameters[0].split(',')

        if (paramArgs.length > 2) {
            return false
        }

        return true
    }

    return false
}
