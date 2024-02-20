/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { findParentProjectFile } from '../utilities/workspaceUtils'

export const pythonLanguage = 'python'
export const pythonAllfiles: vscode.DocumentFilter[] = [
    {
        scheme: 'file',
        language: pythonLanguage,
    },
]

export const pythonBasePattern = '**/requirements.txt'

export async function getLambdaHandlerCandidates(uri: vscode.Uri): Promise<LambdaHandlerCandidate[]> {
    const rootUri = (await findParentProjectFile(uri, /^requirements\.txt$/)) || uri

    const filename = uri.fsPath
    const parsedPath = path.parse(filename)
    // Python handler paths are slash separated and don't include the file extension
    const handlerPath = path
        .relative(path.parse(rootUri.fsPath).dir, path.join(parsedPath.dir, parsedPath.name))
        .split(path.sep)
        .join('/')

    const symbols: vscode.DocumentSymbol[] =
        (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', uri)) ??
        []

    return symbols.filter(isTopLevelFunction).map<LambdaHandlerCandidate>(symbol => {
        return {
            filename,
            handlerName: `${handlerPath}.${symbol.name}`,
            rootUri: rootUri,
            range: symbol.range,
        }
    })
}

function isTopLevelFunction(symbol: vscode.DocumentSymbol) {
    // if the function is indented at all, it is not classified as being a top-level function in the eyes of Python
    return symbol.kind === vscode.SymbolKind.Function && symbol.range.start.character === 0
}
