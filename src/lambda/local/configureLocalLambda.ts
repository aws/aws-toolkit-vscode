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
import * as sleep from 'sleep-promise'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { access, mkdir, writeFile } from '../../shared/filesystem'
import { readFileAsString } from '../../shared/filesystemUtilities'
import { getLogger, Logger } from '../../shared/logger'
import { DefaultSettingsConfiguration } from '../../shared/settingsConfiguration'

const localize = nls.loadMessageBundle()

export interface HandlerConfig {
    event: {},
    environmentVariables: {
        [ name: string ]: string
    }
}

export interface HandlersConfig {
    handlers: {
        [ handler: string ]: HandlerConfig | undefined
    }
}

export interface ConfigureLocalLambdaContext {
    showTextDocument: typeof vscode.window.showTextDocument
    executeCommand: typeof vscode.commands.executeCommand
    showInformationMessage: typeof vscode.window.showInformationMessage
}

class DefaultConfigureLocalLambdaContext implements ConfigureLocalLambdaContext {
    public readonly showTextDocument = vscode.window.showTextDocument
    public readonly executeCommand = vscode.commands.executeCommand
    public readonly showInformationMessage = vscode.window.showInformationMessage
}

// Precondition: `handler` is a valid lambda handler name.
export async function configureLocalLambda(
    workspaceFolder: vscode.WorkspaceFolder,
    handler: string,
    context: ConfigureLocalLambdaContext = new DefaultConfigureLocalLambdaContext()
): Promise<void> {

    const uri = getConfigUri(workspaceFolder)

    await ensureHandlersConfigFileExists(uri, handler)

    const editor: vscode.TextEditor = await context.showTextDocument(uri)
    if (await prepareConfig(editor, handler, context)) {
        // Perf: TextDocument.save is smart enough to no-op if the document is not dirty.
        await editor.document.save()
    } else {
        throw new Error(`Could not update config file '${uri.fsPath}'`)
    }

    await context.showTextDocument(
        editor.document,
        { selection: await getEventRange(editor, handler, context) }
    )
}

export async function getLocalLambdaConfiguration(
    workspaceFolder: vscode.WorkspaceFolder,
    handler: string
): Promise<HandlerConfig> {

    const handlersConfig = await getHandlersConfig(workspaceFolder)
    const emptyHandlerConfig = buildHandlerConfig()

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
        await access(path.dirname(uri.fsPath))
    } catch {
        await mkdir(path.dirname(uri.fsPath), { recursive: true })
    }

    try {
        await access(uri.fsPath)
    } catch {
        await writeFile(uri.fsPath, JSON.stringify(buildHandlersConfig(handler), undefined, getTabSize()))
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

export function buildHandlerConfig(): HandlerConfig {
    return {
        event: {},
        environmentVariables: {}
    }
}

function getTabSize(editor?: vscode.TextEditor): number {
    const tabSize = !editor ? undefined : editor.options.tabSize

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

async function loadSymbols(
    uri: vscode.Uri,
    context: ConfigureLocalLambdaContext,
    maxAttempts = 10,
    retryDelayMillis = 200
): Promise<vscode.DocumentSymbol[] | undefined> {

    const symbols = await context.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        uri
    )
    // checking if symbols exists as this can fail if the VS Code JSON symbol provider is not yet initialized
    if (symbols) {
        // file has symbols if JSON with at least one valid top-level key/value pair
        return symbols
    }

    if (maxAttempts <= 0) {
        return undefined
    }

    // waiting before retry to wait for JSON parser
    await sleep(retryDelayMillis)

    return await loadSymbols(uri, context, maxAttempts - 1, retryDelayMillis)
}

async function prepareConfig(
    editor: vscode.TextEditor,
    handler: string,
    context: ConfigureLocalLambdaContext
): Promise<boolean> {

    let symbols: vscode.DocumentSymbol[] | undefined = await loadSymbols(editor.document.uri, context)
    let shouldOverwrite: boolean = false
    let shouldLoop: boolean = !symbols

    while (!symbols && shouldLoop) {
        const responseRetry: string     = localize('AWS.message.prompt.cantLoadHandlers.retry',
                                                   'Retry')
        const responseOverwrite: string = localize('AWS.message.prompt.cantLoadHandlers.overwrite',
                                                   'Overwrite existing handlers.json')
        const responseCancel: string    = localize('AWS.message.prompt.cantLoadHandlers.cancel',
                                                   'Cancel')
        const failMessage = await context.showInformationMessage(
            localize('AWS.message.prompt.cantLoadHandlers.message',
                     'There was an issue parsing your handlers.json file.'),
            responseRetry,
            responseOverwrite,
            responseCancel
        )
        switch (failMessage) {
            case responseRetry: {
                // Retry => reload saved file
                // executeCommand from earlier loadSymbols runs opens the file in editor
                // this means that a user can edit their JSON and successfully retry loading
                symbols = await loadSymbols(editor.document.uri, context, 0, 0)
                break
            }
            case responseOverwrite: {
                // Overwrite => recreate file from scratch
                shouldOverwrite = true
                shouldLoop = false
                break
            }
            default: {
                // Cancel => don't overwrite file (X-ing out of dialog => implicit cancel)
                shouldOverwrite = false
                shouldLoop = false
                break
            }
        }
    }

    // If the file is empty, or if it is non-empty but cannot be even partially parsed as JSON,
    // and the user wants to overwrite, build it from scratch.
    if ((!symbols || symbols.length < 1) && shouldOverwrite) {
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

    // file is valid enough (file exists and has at least one valid top-level JSON key:value pair)
    if (symbols) {
        const handlersSymbol: vscode.DocumentSymbol | undefined = symbols.find(c => c.name === 'handlers')
        if (!handlersSymbol || handlersSymbol.children.length < 1) {
            // create handlers field from scratch if it doesn't exist. This also creates all other handler fields
            return await addHandlersField(handler, editor)
        }
        const handlerSymbol: vscode.DocumentSymbol | undefined = handlersSymbol.children.find(c => c.name === handler)
        if (!handlerSymbol || handlerSymbol.children.length < 1) {
            // create handler field from scratch if it doesn't exist. This also creates all other handler fields
            return await addHandlerFieldToHandlersField(handlersSymbol, handler, editor)
        }
        const tempHandler = buildHandlerConfig()
        let editorIsValid: boolean = true
        for (const field of Object.keys(tempHandler)) {
            // add all other subfields under the handler if they don't exist
            editorIsValid = await addSampleField(field, handlerSymbol, editor)
            if (!editorIsValid) {
                break
            }
        }

        return editorIsValid
    }

    // file is not JSON with at least one valid top-level key:value pair
    // but user has opted to not overwrite the file
    return true
}

async function addHandlersField(
    handler: string,
    editor: vscode.TextEditor
): Promise<boolean> {

    const config: HandlersConfig = {
        ...parse(editor.document.getText()),
        ...buildHandlersConfig(handler)
    }
    const configString = JSON.stringify(config, undefined, getTabSize(editor))

    return await editor.edit(
        // The jsonc-parser API does not provide a safe way to insert a child into an empty list,
        // so in the case that the config file exists, but has an empty or undefined `handlers` property,
        // we need to replace the entire document.
        editBuilder => editBuilder.replace(
            new vscode.Range(
                new vscode.Position(0, 0),
                editor.document.positionAt(editor.document.getText().length)
            ),
            configString
        )
    )

}

async function addHandlerFieldToHandlersField(
    handlersSymbol: vscode.DocumentSymbol,
    handler: string,
    editor: vscode.TextEditor
): Promise<boolean> {

    // handler doesn't exist or is empty -- add handler from scratch
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

async function addSampleField(
    fieldKey: string,
    handlerSymbol: vscode.DocumentSymbol,
    editor: vscode.TextEditor
): Promise<boolean> {

    const fieldSymbol: vscode.DocumentSymbol | undefined = handlerSymbol.children.find(c => c.name === fieldKey)

    if (!fieldSymbol) {
        const insertPosition: vscode.Position = handlerSymbol.children.reduce(
            (lastSoFar: vscode.Position, current: vscode.DocumentSymbol) =>
                current.range.end.isAfter(lastSoFar) ? current.range.end : lastSoFar,
            new vscode.Position(0, 0)
        )

        const baseIndentation: string = ' '.repeat(getTabSize(editor)).repeat(3)
        const snippet: string = `,${os.EOL}${baseIndentation}"${fieldKey}": {}${os.EOL}`

        return await editor.edit(editBuilder => editBuilder.insert(insertPosition, snippet))
    }

    return true
}

async function getEventRange(
    editor: vscode.TextEditor,
    handler: string,
    context: ConfigureLocalLambdaContext
): Promise<vscode.Range> {

    const logger: Logger = getLogger()

    const symbols: vscode.DocumentSymbol[] | undefined = await context.executeCommand<vscode.DocumentSymbol[]>(
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
        logger.warn(`Invalid format for document ${editor.document.uri}`)

        return defaultRange
    }

    const handlerSymbol: vscode.DocumentSymbol | undefined = handlersSymbol.children.find(c => c.name === handler)
    if (!handlerSymbol) {
        logger.warn(`Unable to find config for handler ${handler}`)

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
