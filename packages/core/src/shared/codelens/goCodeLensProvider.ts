/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { VSCODE_EXTENSION_ID } from '../extensions'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { getLogger } from '../logger/logger'
import { stripNewLinesAndComments } from '../../shared/utilities/textUtilities'
import { findParentProjectFile } from '../utilities/workspaceUtils'
import { basename, dirname } from 'path'
import { activateExtension } from '../utilities/vsCodeUtils'

export const goLanguage = 'go'
export const goAllfiles: vscode.DocumentFilter[] = [
    {
        scheme: 'file',
        language: goLanguage,
    },
]

// Go modules were introduced in Go 1.11
// Before that, $GOPATH had to be set properly to find dependencies
// We currently just ignore projects without a Go module file
export const goBasePattern = '**/go.mod'

export async function getLambdaHandlerCandidates(document: vscode.TextDocument): Promise<LambdaHandlerCandidate[]> {
    const modFile = await findParentProjectFile(document.uri, /go\.mod$/)
    const hasGoExtension = !!(await activateExtension(VSCODE_EXTENSION_ID.go))

    if (!modFile || !hasGoExtension) {
        return []
    }

    // We'll check that the Go lambda module is required, otherwise showing debug configs does not make much sense
    try {
        const modDoc: vscode.TextDocument = await vscode.workspace.openTextDocument(modFile!)
        // TODO: Check require and import statements for the correct modules/packages (very low priority)

        if (
            !modDoc.getText().includes('github.com/aws/aws-lambda-go') ||
            !document.getText().includes('github.com/aws/aws-lambda-go/lambda')
        ) {
            return []
        }
    } catch (err) {
        // No need to throw an error
        getLogger().verbose(
            `Go CodeLens: not enabled for "${document.fileName}". Verify that a go.mod file exists and is within the module directory`
        )

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
                handlerName: basename(dirname(filename)),
                rootUri: modFile,
                range: symbol.range,
            }
        })
}

/**
 * Checks for a valid lamba function signature for Go
 *
 * @param document VS Code Document that contains the symbol
 * @param symbol VS Code DocumentSymbol to analyze
 */
export function isValidFuncSignature(document: vscode.TextDocument, symbol: vscode.DocumentSymbol): boolean {
    if (symbol.name === 'main') {
        return false
    }

    // Documentation for valid lambda handler: https://docs.aws.amazon.com/lambda/latest/dg/golang-handler.html
    // The LSP doesn't expose any low-level type-checking functionality unfortunately. If we want to perform
    // type-checking on our lambdas, we need to write the code for that ourselves using 'executeTypeDefinitionProvider'.
    if (symbol.kind === vscode.SymbolKind.Function && symbol.range.start.character === 0) {
        // vscode details does not include the return type in the signature :(
        // otherwise we would just use symbol.details instead of parsing it ourselves
        const funcWithBody: string = document.getText(symbol.range)

        const bodyStart: number = funcWithBody.search(/\{/)
        const sigStart: number = funcWithBody.search(/\(/)

        if (bodyStart === -1 || sigStart === -1) {
            return false
        }

        const funcSig: string = stripNewLinesAndComments(funcWithBody.substring(sigStart, bodyStart))

        const funcSigParts: string[] = funcSig.split(/\)/)
        const argTypes: string[] = parseTypes(funcSigParts[0])
        const retTypes: string[] = funcSigParts.length > 1 ? parseTypes(funcSigParts[1]) : []

        return validateArgumentTypes(argTypes) && validateReturnTypes(retTypes)
    }

    return false
}

/**
 * Finds all types of the parameter list, stripping out names if they exist.
 * Parenthesis are stripped from the list if they exist.
 *
 * @param params List of parameters delimeted by commas
 *
 * @returns A list of types mapping 1:1 with the input
 */
function parseTypes(params: string): string[] {
    params = params.replace(/\(|\)/, '')
    const types: string[] = []

    let lastType: number = 0
    const paramParts = params.split(',')

    // Names of parameters must either be all present or all absent: https://golang.org/ref/spec#Function_types
    paramParts.forEach((element: string, i: number) => {
        const parts: string[] = element.trim().split(/\s+/)
        const type: string = parts.length > 1 ? parts[1].trim() : parts[0].trim()

        // Go allows types to be assigned to multiple parameters, e.g. (x, y, z int) === (x int, y int, z int)
        if (parts.length > 1) {
            for (let j = lastType; j < i; j++) {
                types[j] = type
            }
            lastType = i + 1
        }

        if (type !== '') {
            types.push(type)
        }
    })

    return types
}

function validateArgumentTypes(argTypes: string[]): boolean {
    if (argTypes.length > 2) {
        return false
    } else if (argTypes.length === 2) {
        return argTypes[0].includes('Context')
    } else {
        return true
    }
}

function validateReturnTypes(retTypes: string[]): boolean {
    if (retTypes.length > 2) {
        return false
    } else {
        return retTypes.length === 0 ? true : retTypes.pop()!.includes('error')
    }
}
