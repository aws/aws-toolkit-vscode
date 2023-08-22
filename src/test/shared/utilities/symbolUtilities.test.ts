/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import { getChildrenRange, loadSymbols, LoadSymbolsContext } from '../../../shared/utilities/symbolUtilities'

function makeSymbol(name: string): vscode.DocumentSymbol {
    return new vscode.DocumentSymbol(
        name,
        'MyDetail',
        vscode.SymbolKind.Property,
        new vscode.Range(0, 0, 0, 0),
        new vscode.Range(0, 0, 0, 0)
    )
}

describe('symbolUtilities', async function () {
    describe('loadSymbols', async function () {
        it('returns symbols if available', async function () {
            const context: LoadSymbolsContext = {
                async executeCommand<T>(command: string, ...args: any[]): Promise<T> {
                    return [makeSymbol('MyName')] as unknown as T
                },
            }

            const actual = await loadSymbols({
                uri: vscode.Uri.file(''),
                context,
                maxRetries: 0,
            })

            assert.ok(actual)
            assert.strictEqual(actual!.length, 1)
            assert.strictEqual(actual![0].name, 'MyName')
        })

        it('does not retry if maxRetries is 0', async function () {
            const executeCommandArgs: { command: string; uri: vscode.Uri }[] = []
            const context: LoadSymbolsContext = {
                async executeCommand<T>(command: string, ...args: any[]): Promise<T> {
                    assert.strictEqual(args.length, 1)
                    executeCommandArgs.push({ command, uri: args[0] as vscode.Uri })

                    return undefined as T
                },
            }

            const actual = await loadSymbols({
                uri: vscode.Uri.file(''),
                context,
                maxRetries: 0,
            })

            assert.strictEqual(actual, undefined)
            assert.strictEqual(executeCommandArgs.length, 1)
            assert.strictEqual(executeCommandArgs[0].command, 'vscode.executeDocumentSymbolProvider')
            assert.strictEqual(executeCommandArgs[0].uri.fsPath, path.sep)
        })

        it('retries if maxRetries is non-zero', async function () {
            const executeReturnValues = [undefined, undefined, [makeSymbol('MyName')]].reverse()
            const executeCommandArgs: { command: string; uri: vscode.Uri }[] = []
            const context: LoadSymbolsContext = {
                async executeCommand<T>(command: string, ...args: any[]): Promise<T> {
                    assert.strictEqual(args.length, 1)
                    executeCommandArgs.push({ command, uri: args[0] as vscode.Uri })

                    return executeReturnValues.pop() as T
                },
            }

            const actual = await loadSymbols({
                uri: vscode.Uri.file(''),
                context,
                maxRetries: 2,
            })

            assert.ok(actual)
            assert.strictEqual(actual!.length, 1)
            assert.strictEqual(actual![0].name, 'MyName')
            assert.strictEqual(executeCommandArgs.length, 3)
            for (const args of executeCommandArgs) {
                assert.strictEqual(args.command, 'vscode.executeDocumentSymbolProvider')
                assert.strictEqual(args.uri.fsPath, path.sep)
            }
        })

        it('returns undefined if all retries fail', async function () {
            const executeCommandArgs: { command: string; uri: vscode.Uri }[] = []
            const context: LoadSymbolsContext = {
                async executeCommand<T>(command: string, ...args: any[]): Promise<T> {
                    assert.strictEqual(args.length, 1)
                    executeCommandArgs.push({ command, uri: args[0] as vscode.Uri })

                    return undefined as T
                },
            }

            const actual = await loadSymbols({
                uri: vscode.Uri.file(''),
                context,
                maxRetries: 2,
            })

            assert.strictEqual(actual, undefined)
            assert.strictEqual(executeCommandArgs.length, 3)
            for (const args of executeCommandArgs) {
                assert.strictEqual(args.command, 'vscode.executeDocumentSymbolProvider')
                assert.strictEqual(args.uri.fsPath, path.sep)
            }
        })
    })

    describe('getChildrenRange', async function () {
        it('returns the range for the child if exactly one child is found', async function () {
            const symbol = new vscode.DocumentSymbol(
                'MyParent',
                'MyParentDetail',
                vscode.SymbolKind.Object,
                new vscode.Range(0, 0, 5, 10),
                new vscode.Range(0, 0, 0, 10)
            )

            symbol.children.push(
                new vscode.DocumentSymbol(
                    'MyChild',
                    'MyChildDetail',
                    vscode.SymbolKind.Property,
                    new vscode.Range(1, 0, 2, 10),
                    new vscode.Range(1, 0, 1, 10)
                )
            )

            const actualRange = await getChildrenRange(symbol)
            assert.ok(actualRange)
            assert.strictEqual(actualRange.start.line, 1)
            assert.strictEqual(actualRange.start.character, 0)
            assert.strictEqual(actualRange.end.line, 2)
            assert.strictEqual(actualRange.end.character, 10)
        })

        it('returns the range for all children if multiple children are found', async function () {
            const symbol = new vscode.DocumentSymbol(
                'MyParent',
                'MyParentDetail',
                vscode.SymbolKind.Object,
                new vscode.Range(0, 0, 5, 10),
                new vscode.Range(0, 0, 0, 10)
            )

            symbol.children.push(
                new vscode.DocumentSymbol(
                    'MyChild',
                    'MyChildDetail',
                    vscode.SymbolKind.Property,
                    new vscode.Range(1, 0, 2, 10),
                    new vscode.Range(1, 0, 1, 10)
                )
            )

            symbol.children.push(
                new vscode.DocumentSymbol(
                    'MyChild',
                    'MyChildDetail',
                    vscode.SymbolKind.Property,
                    new vscode.Range(3, 0, 4, 10),
                    new vscode.Range(3, 0, 3, 10)
                )
            )

            const actualRange = await getChildrenRange(symbol)
            assert.ok(actualRange)
            assert.strictEqual(actualRange.start.line, 1)
            assert.strictEqual(actualRange.start.character, 0)
            assert.strictEqual(actualRange.end.line, 4)
            assert.strictEqual(actualRange.end.character, 10)
        })

        it('returns the range for the entire symbol if no children are found', async function () {
            const symbol = new vscode.DocumentSymbol(
                'MyParent',
                'MyParentDetail',
                vscode.SymbolKind.Object,
                new vscode.Range(0, 0, 5, 10),
                new vscode.Range(0, 0, 0, 10)
            )

            const actualRange = await getChildrenRange(symbol)
            assert.ok(actualRange)
            assert.strictEqual(actualRange.start.line, 0)
            assert.strictEqual(actualRange.start.character, 0)
            assert.strictEqual(actualRange.end.line, 5)
            assert.strictEqual(actualRange.end.character, 10)
        })
    })
})
