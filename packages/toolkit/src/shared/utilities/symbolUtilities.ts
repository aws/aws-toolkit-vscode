/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { sleep } from '../utilities/timeoutUtils'

export interface LoadSymbolsContext {
    executeCommand: typeof vscode.commands.executeCommand
}

export async function loadSymbols({
    uri,
    context,
    maxRetries = 10,
    retryDelayMillis = 200,
}: {
    uri: vscode.Uri
    context: LoadSymbolsContext
    maxRetries?: number
    retryDelayMillis?: number
}): Promise<vscode.DocumentSymbol[] | undefined> {
    const symbols = await context.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', uri)
    // checking if symbols exists as this can fail if the VS Code JSON symbol provider is not yet initialized
    if (symbols) {
        // file has symbols if JSON with at least one valid top-level key/value pair
        return symbols
    }

    if (maxRetries <= 0) {
        return undefined
    }

    // waiting before retry to wait for JSON parser
    await sleep(retryDelayMillis)

    return await loadSymbols({
        uri,
        context,
        maxRetries: maxRetries - 1,
        retryDelayMillis,
    })
}

export async function getChildrenRange(symbol: vscode.DocumentSymbol): Promise<vscode.Range> {
    let start: vscode.Position | undefined
    let end: vscode.Position | undefined

    for (const range of symbol.children.map(c => c.range)) {
        if (!start || range.start.isBefore(start)) {
            start = range.start
        }

        if (!end || range.end.isAfter(end)) {
            end = range.end
        }
    }

    if (!start || !end) {
        // If symbol has no children, default to its entire range.
        return symbol.range
    }

    return new vscode.Range(start, end)
}
