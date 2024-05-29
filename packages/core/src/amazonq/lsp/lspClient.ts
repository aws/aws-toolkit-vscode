/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/*!
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 */

import * as path from 'path'
import * as nls from 'vscode-nls'

import { Disposable, ExtensionContext } from 'vscode'

import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient'
import { ClearRequestType, IndexRequestType, QueryRequestType } from './types'

const localize = nls.loadMessageBundle()
let client: LanguageClient | undefined = undefined

export async function indexFiles(request: string[], rootPath: string, refresh: boolean) {
    if (client) {
        const resp = await client.sendRequest(IndexRequestType, {
            filePaths: request,
            rootPath: rootPath,
            refresh: refresh,
        })
        return resp
    }
}

export async function query(request: string) {
    if (client) {
        const resp = await client.sendRequest(QueryRequestType, request)
        return resp
    }
}

export async function clear(request: string) {
    if (client) {
        const resp = await client.sendRequest(ClearRequestType, request)
        return resp
    }
}

export async function activate(extensionContext: ExtensionContext) {
    const toDispose = extensionContext.subscriptions

    let rangeFormatting: Disposable | undefined
    // The server is implemented in node
    let pkg = path.dirname(extensionContext.extensionPath)

    let serverModule = path.join(pkg, 'qserver/lspServer.js')
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
    const debugOptions = { execArgv: ['--nolazy', '--inspect=6009', '--preserve-symlinks'] }

    // If the extension is launch in debug mode the debug server options are use
    // Otherwise the run options are used
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions },
    }

    const documentSelector = [{ scheme: 'file', language: '*' }]

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        // Register the server for json documents
        documentSelector,
        initializationOptions: {
            handledSchemaProtocols: ['file', 'untitled'], // language server only loads file-URI. Fetching schemas with other protocols ('http'...) are made on the client.
            provideFormatter: false, // tell the server to not provide formatting capability and ignore the `aws.stepfunctions.asl.format.enable` setting.
        },
    }

    // Create the language client and start the client.
    client = new LanguageClient(
        'codewhisperer',
        localize('codewhisperer.server.name', 'Amazon Q Language Server'),
        serverOptions,
        clientOptions
    )
    client.registerProposedFeatures()

    const disposable = client.start()
    toDispose.push(disposable)

    return client.onReady().then(() => {
        const disposableFunc = { dispose: () => rangeFormatting?.dispose() as void }
        toDispose.push(disposableFunc)
    })
}

export async function deactivate(): Promise<any> {
    return Promise.resolve(undefined)
}
