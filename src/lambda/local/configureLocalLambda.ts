/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { parse } from 'jsonc-parser'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { accessAsync, mkdirAsync, writeFileAsync } from '../../shared/filesystem'
import { DefaultSettingsConfiguration } from '../../shared/settingsConfiguration'

export interface HandlerConfig {
    event: any
}

export interface HandlersConfig {
    handlers: {
        [ handler: string ]: HandlerConfig | undefined
    }
}

export async function configureLocalLambda(sourceUri: vscode.Uri, handler: string): Promise<void> {
    // Handler will be the fully-qualified name, so we also allow '.' despite it being forbidden in handler names.
    if (/[^\w\-\.]/.test(handler)) {
        throw new Error(
            `Invalid handler name: '${handler}'. ` +
            'Handler names can contain only letters, numbers, hyphens, and underscores.'
        )
    }

    const workspaceFolder: vscode.WorkspaceFolder | undefined = vscode.workspace.getWorkspaceFolder(sourceUri)
    if (!workspaceFolder) {
        console.error(`Source file ${sourceUri} is external to the current workspace.`)

        return
    }

    // Preserve the scheme, etc of the workspace uri.
    const uri = workspaceFolder.uri.with({
        path: path.join(workspaceFolder.uri.fsPath, '.aws', 'handlers.json')
    })

    try {
        await accessAsync(path.dirname(uri.fsPath))
    } catch {
        await mkdirAsync(path.dirname(uri.fsPath), { recursive: true })
    }

    try {
        await accessAsync(uri.fsPath)
    } catch {
        await writeFileAsync(uri.fsPath, JSON.stringify(buildHandlersConfig(handler), undefined, getTabSize()))
    }

    const editor: vscode.TextEditor = await vscode.window.showTextDocument(uri)
    if (await prepareConfig(editor, handler)) {
        // Perf: TextDocument.save is smart enough to no-op if the document is not dirty.
        await editor.document.save()
    } else {
        throw new Error(`Could not update config file '${uri.fsPath}'`)
    }

    await vscode.window.showTextDocument(
        editor.document,
        { selection: await getFocusRange(editor, handler) }
    )
}

function buildHandlersConfig(handler?: string): HandlersConfig {
    const config: HandlersConfig = {
        handlers: {}
    }

    if (!!handler) {
        config.handlers[handler] = buildHandlerConfig()
    }

    return config
}

function buildHandlerConfig(): HandlerConfig {
    return {
        event: {}
    }
}

function getTabSize(tabSize?: string | number | undefined): number {
    switch (typeof tabSize) {
        case 'number':
            return tabSize
        case 'string':
            return Number.parseInt(tabSize, 10)
        default:
            // If we couldn't determine the tabSize at the document, workspace, or user level, default to 4.
            return new DefaultSettingsConfiguration('editor').readSetting<number>('tabSize') || 4
    }
}

async function prepareConfig(editor: vscode.TextEditor, handler: string): Promise<boolean> {
    // Awaiting this command is required because without it, symbols for a newly created document might not yet
    // be available, in which case vscode.executeDocumentSymbolProvider will return an empty list.
    await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'editor.action.wordHighlight.trigger',
        editor.document.uri
    )
    const symbols: vscode.DocumentSymbol[] | undefined = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        editor.document.uri
    )

    const entireDocumentRange: vscode.Range = new vscode.Range(
        new vscode.Position(0, 0),
        editor.document.positionAt(editor.document.getText().length)
    )

    if (!symbols || symbols.length < 1) {
        return await editor.edit(editBuilder => {
            const config: HandlersConfig = buildHandlersConfig(handler)

            editBuilder.replace(
                entireDocumentRange,
                JSON.stringify(config, undefined, getTabSize(editor.options.tabSize))
            )
        })
    }

    const handlersSymbol: vscode.DocumentSymbol | undefined = symbols.find(c => c.name === 'handlers')
    if (!handlersSymbol || handlersSymbol.children.length < 1) {
        const config: HandlersConfig = {
            // Use jsonc-parser.parse instead of JSON.parse, as JSONC can handle comments. VS Code uses jsonc-parser
            // under the hood to provide symbols for JSON documents, so this will keep us consistent with VS code.
            ...parse(editor.document.getText()),
            ...buildHandlersConfig(handler)
        }
        const configString = JSON.stringify(config, undefined, getTabSize(editor.options.tabSize))

        return await editor.edit(editBuilder => editBuilder.replace(entireDocumentRange, configString))
    }

    const handlerSymbol: vscode.DocumentSymbol | undefined = handlersSymbol.children.find(c => c.name === handler)
    if (!handlerSymbol || handlerSymbol.children.length < 1) {
        // At this point we know that handlersSymbol has at least one child.
        const lastChildEnd: vscode.Position = handlersSymbol.children.reduce(
            (lastSoFar: vscode.Position, current: vscode.DocumentSymbol) =>
                current.range.end.isAfter(lastSoFar) ? current.range.end : lastSoFar,
            new vscode.Position(0, 0)
        )

        // For example (tabWidth = 4):
        // [START],
        //         "myHandler": {
        //             event: {}
        //         }
        // [END]
        const tabSize = getTabSize(editor.options.tabSize)
        const baseIndentation: string = ' '.repeat(tabSize).repeat(2)
        // We have already validated that handler contains only letters, numbers, hyphens, and underscores.
        let snippet: string = `"${handler}": ${JSON.stringify(buildHandlerConfig(), undefined, tabSize)}`
            .split(/\r?\n/).map(line => `${baseIndentation}${line}`).join(os.EOL)
        snippet = `,${os.EOL}${snippet}${os.EOL}`

        return await editor.edit(editBuilder => editBuilder.insert(lastChildEnd, snippet))
    }

    const eventSymbol: vscode.DocumentSymbol | undefined = handlerSymbol.children.find(c => c.name === 'event')
    if (!eventSymbol) {
        // At this point we know that handlerSymbol has at least one child.
        const lastChildEnd: vscode.Position = handlerSymbol.children.reduce(
            (lastSoFar: vscode.Position, current: vscode.DocumentSymbol) =>
                current.range.end.isAfter(lastSoFar) ? current.range.end : lastSoFar,
            new vscode.Position(0, 0)
        )

        const baseIndentation: string = ' '.repeat(getTabSize(editor.options.tabSize)).repeat(3)
        const snippet: string = `,${os.EOL}${baseIndentation}"event": {}${os.EOL}`

        return await editor.edit(editBuilder => editBuilder.insert(lastChildEnd, snippet))
    }

    return true
}

async function getFocusRange(editor: vscode.TextEditor, handler: string): Promise<vscode.Range> {
    const symbols: vscode.DocumentSymbol[] | undefined = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        editor.document.uri
    )

    const defaultRange = new vscode.Range(
        new vscode.Position(0, 0),
        new vscode.Position(0, 0)
    )

    if (!symbols || symbols.length < 1) {
        return defaultRange
    }

    const handlersSymbol: vscode.DocumentSymbol | undefined = symbols.find(c => c.name === 'handlers')
    if (!handlersSymbol) {
        console.error(`Invalid format for document ${editor.document.uri}`)

        return defaultRange
    }

    const handlerSymbol: vscode.DocumentSymbol | undefined = handlersSymbol.children.find(c => c.name === handler)
    if (!handlerSymbol) {
        console.error(`Unable to find config for handler ${handler}`)

        return defaultRange
    }

    const eventSymbol: vscode.DocumentSymbol | undefined = handlerSymbol.children.find(c => c.name === 'event')
    if (!eventSymbol) {
        return handlerSymbol.range
    }

    return getChildrenRange(eventSymbol)
}

async function getChildrenRange(symbol: vscode.DocumentSymbol) {
    const ranges: vscode.Range[] = symbol.children.map(c => c.range)

    let start: vscode.Position | undefined
    let end: vscode.Position | undefined

    for (const range of ranges) {
        if (!start || range.start.isBefore(start)) {
            start = range.start
        }

        if (!end || range.end.isAfter(end)) {
            end = range.end
        }
    }

    if (!start || !end) {
        // If symbol has no children, default ito
        return symbol.range
    }

    return new vscode.Range(start, end)
}
