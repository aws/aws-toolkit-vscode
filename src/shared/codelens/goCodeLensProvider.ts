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
 * Checks for a valid lamba function signature for Go
 *
 * @param document  VS Code Document that contains the symbol
 * @param symbol  VS Code DocumentSymbol to analyze
 */
export function isValidFuncSignature(document: vscode.TextDocument, symbol: vscode.DocumentSymbol): boolean {
    if (symbol.name === 'main') {
        return false
    }

    // Documentation for valid lambda handler: https://docs.aws.amazon.com/lambda/latest/dg/golang-handler.html
    // The LSP doesn't expose any low-level type-checking functionality unfortunately. If we want to perform
    // type-checking on our lambdas, we need to write the code for that ourselves using 'executeTypeDefinitionProvider'.
    if (symbol.kind === vscode.SymbolKind.Function && symbol.range.start.character == 0) {
        // vscode details does not include the return type in the signature :(
        // otherwise we would just use symbol.details instead of parsing it ourselves
        const funcWithBody: string = document.getText(symbol.range)

        // '(' and '{' will always exist, otherwise symbol is not a function!
        const bodyStart: number = funcWithBody.search(/\{/)
        const sigStart: number = funcWithBody.search(/\(/)
        const funcSig: string = stripNewLinesAndComments(funcWithBody.substring(sigStart, bodyStart))

        const funcSigParts: string[] = funcSig.split(/\)/)
        const argTypes: string[] = parseTypes(funcSigParts[0])
        const retTypes: string[] = funcSigParts.length > 1 ? parseTypes(funcSigParts[1]) : []

        if (argTypes.length > 2 || retTypes.length > 2) {
            return false
        }

        // TODO: actually check the types to make sure they are valid

        return true
    }

    return false
}

/**
 * Go allows function signatures to be multi-line, so we should parse these into something more usable.
 *
 * @param text  String to parse
 */
function stripNewLinesAndComments(text: string) {
    const blockCommentRegExp = /\/\*[.*?]\*\//
    let result: string = ''

    text.split(/\r|\n/).map(s => {
        const commentStart: number = s.search(/\/\//)
        s = s.replace(blockCommentRegExp, '')
        result += commentStart === -1 ? s : s.substring(0, commentStart)
    })

    return result
}

/**
 * Finds all types of the parameter list, stripping out names if they exist.
 * Parenthesis are stripped from the list if they exist.
 *
 * @param params  List of parameters delimeted by commas
 */
function parseTypes(params: string): string[] {
    params = params.replace(/\(|\)/, '')
    const types: string[] = []

    let lastType: number = 0
    const paramParts = params.split(',')

    // Names of parameters must either be all present or all absent: https://golang.org/ref/spec#Function_types
    for (let i = 0; i < paramParts.length; i++) {
        const parts: string[] = paramParts[i].trimStart().split(' ')
        const type: string = parts.length > 1 ? parts[1] : parts[0]

        // Go allows types to be assigned to multiple parameters, e.g. (x, y, z int) === (x int, y int, z int)
        if (parts.length > 1) {
            for (let j = lastType; j < i; j++) {
                types[j] = type
            }
            lastType = i + 1
        }

        types.push(type)
    }

    return types
}
