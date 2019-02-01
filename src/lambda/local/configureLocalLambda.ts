/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

// Use jsonc-parser.parse instead of JSON.parse, as JSONC can handle comments. VS Code uses jsonc-parser
// under the hood to provide symbols for JSON documents, so this will keep us consistent with VS code.
import { parse } from 'jsonc-parser'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { accessAsync, mkdirAsync, writeFileAsync } from '../../shared/filesystem'
import { readFileAsString } from '../../shared/filesystemUtilities'
import { DefaultSettingsConfiguration } from '../../shared/settingsConfiguration'

export interface HandlerConfig {
    event: {}
}

export interface HandlersConfig {
    handlers: {
        [ handler: string ]: HandlerConfig | undefined
    }
}

// Precondition: `handler` is a valid lambda handler name.
export async function configureLocalLambda(workspaceFolder: vscode.WorkspaceFolder, handler: string): Promise<void> {
    const uri = getConfigUri(workspaceFolder)

    await ensureHandlersConfigFileExists(uri, handler)

    const editor: vscode.TextEditor = await vscode.window.showTextDocument(uri)
    if (await prepareConfig(editor, handler)) {
        // Perf: TextDocument.save is smart enough to no-op if the document is not dirty.
        await editor.document.save()
    } else {
        throw new Error(`Could not update config file '${uri.fsPath}'`)
    }

    await vscode.window.showTextDocument(
        editor.document,
        { selection: await getEventRange(editor, handler) }
    )
}

export async function getLocalLambdaConfiguration(
    workspaceFolder: vscode.WorkspaceFolder,
    handler: string
): Promise<HandlerConfig> {
    const handlersConfig = await getHandlersConfig(workspaceFolder)
    const emptyHandlerConfig: HandlerConfig = {
        event: {}
    }

    if (!handlersConfig || !handlersConfig.handlers) {
        return emptyHandlerConfig
    }

    return handlersConfig.handlers[handler] || emptyHandlerConfig
}

async function getHandlersConfig(workspaceFolder: vscode.WorkspaceFolder): Promise<HandlersConfig> {
    const uri = getConfigUri(workspaceFolder)

    try {
        return parse(await readFileAsString(uri.fsPath)) as HandlersConfig
    } catch {
        return {
            handlers: {}
        }
    }
}

function getConfigUri(workspaceFolder: vscode.WorkspaceFolder): vscode.Uri {
    // Preserve the scheme, etc of the workspace uri.
    return workspaceFolder.uri.with({
        path: path.join(workspaceFolder.uri.fsPath, '.aws', 'handlers.json')
    })
}

async function ensureHandlersConfigFileExists(uri: vscode.Uri, handler: string): Promise<void> {
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

function getTabSize(editor?: vscode.TextEditor): number {
    const defaultTabSize = 4
    const tabSize: number | string = !editor ? defaultTabSize : editor.options.tabSize || defaultTabSize

    switch (typeof tabSize) {
        case 'number':
            // @ts-ignore
            return tabSize
        case 'string':
            // @ts-ignore
            return Number.parseInt(tabSize, 10)
        default:
            // If we couldn't determine the tabSize at the document, workspace, or user level, default to 4.
            return new DefaultSettingsConfiguration('editor').readSetting<number>('tabSize') || defaultTabSize
    }
}

async function getSymbols(uri: vscode.Uri): Promise<vscode.DocumentSymbol[] | undefined> {
    // Awaiting this command is required because without it, symbols for a newly created document might not yet
    // be available, in which case vscode.executeDocumentSymbolProvider will return an empty list.
    await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('editor.action.wordHighlight.trigger', uri)

    return await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', uri)
}

async function prepareConfig(editor: vscode.TextEditor, handler: string): Promise<boolean> {
    const symbols: vscode.DocumentSymbol[] | undefined = await getSymbols(editor.document.uri)

    // If the file is empty, or if it is non-empty but cannot be even partially parsed as JSON, build it from scratch.
    if (!symbols || symbols.length < 1) {
        return await editor.edit(editBuilder => editBuilder.replace(
            // The jsonc-parser API does not provide a safe way to insert a child into an empty list, so in the case
            // that the config file is missing or empty, we need to replace the entire document.
            new vscode.Range(
                new vscode.Position(0, 0),
                editor.document.positionAt(editor.document.getText().length)
            ),
            JSON.stringify(buildHandlersConfig(handler), undefined, getTabSize(editor))
        ))
    }

    // If the config file exists, but `root.handlers` is undefined or empty, initial it with an empty
    // config section for this handler.
    const handlersSymbol: vscode.DocumentSymbol | undefined = symbols.find(c => c.name === 'handlers')
    if (!handlersSymbol || handlersSymbol.children.length < 1) {
        const config: HandlersConfig = {
            ...parse(editor.document.getText()),
            ...buildHandlersConfig(handler)
        }
        const configString = JSON.stringify(config, undefined, getTabSize(editor))

        return await editor.edit(
                // The jsonc-parser API does not provide a safe way to insert a child into an empty list, so in the case
                // that the config file exists, but has an empty or undefined `handlers` property, we need to replace
                // the entire document.
                editBuilder => editBuilder.replace(
                new vscode.Range(
                    new vscode.Position(0, 0),
                    editor.document.positionAt(editor.document.getText().length)
                ),
                configString
            )
        )
    }

    // If `root.handlers` and is non-empty, but does not include an entry for this handler, create and insert one.
    const handlerSymbol: vscode.DocumentSymbol | undefined = handlersSymbol.children.find(c => c.name === handler)
    if (!handlerSymbol || handlerSymbol.children.length < 1) {
        // At this point we know that `root.handlers` has at least one child.
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
        const tabSize = getTabSize(editor)
        const baseIndentation: string = ' '.repeat(tabSize).repeat(2)
        // We have already validated that handler contains only letters, numbers, hyphens, and underscores.
        let snippet: string = `"${handler}": ${JSON.stringify(buildHandlerConfig(), undefined, tabSize)}`
            .split(/\r?\n/).map(line => `${baseIndentation}${line}`).join(os.EOL)
        snippet = `,${os.EOL}${snippet}${os.EOL}`

        return await editor.edit(editBuilder => editBuilder.insert(lastChildEnd, snippet))
    }

    // If there is a config section for this handler, but it doesn't specify a sample event, create and insert
    // an empty sample event.
    const eventSymbol: vscode.DocumentSymbol | undefined = handlerSymbol.children.find(c => c.name === 'event')
    if (!eventSymbol) {
        // At this point we know that handlerSymbol has at least one child.
        const lastChildEnd: vscode.Position = handlerSymbol.children.reduce(
            (lastSoFar: vscode.Position, current: vscode.DocumentSymbol) =>
                current.range.end.isAfter(lastSoFar) ? current.range.end : lastSoFar,
            new vscode.Position(0, 0)
        )

        const baseIndentation: string = ' '.repeat(getTabSize(editor)).repeat(3)
        const snippet: string = `,${os.EOL}${baseIndentation}"event": {}${os.EOL}`

        return await editor.edit(editBuilder => editBuilder.insert(lastChildEnd, snippet))
    }

    return true
}

async function getEventRange(editor: vscode.TextEditor, handler: string): Promise<vscode.Range> {
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
