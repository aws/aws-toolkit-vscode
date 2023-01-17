/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as nls from 'vscode-nls'

const localize = nls.loadMessageBundle()

import { ExtensionContext, workspace } from 'vscode'

import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient'

export async function activateDocumentsLanguageServer(extensionContext: ExtensionContext) {
    const toDispose = extensionContext.subscriptions

    // The server is implemented in rust
    // TODO grab language server from URL/hosted file location
    if (process.env.LANGUAGE_SERVER === undefined) {
        throw Error('Missing env `LANGUAGE_SERVER`. Should be set in `launch.json`.')
    }
    const serverModule = path.resolve(path.join(process.env.LANGUAGE_SERVER))

    const debugOptions = { execArgv: ['--nolazy', '--inspect=6012', '--preserve-symlinks'] }

    // If the extension is launch in debug mode the debug server options are use
    // Otherwise the run options are used
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions },
    }

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        // Register the server for json documents
        documentSelector: [
            { scheme: 'file', language: 'yaml' },
            { scheme: 'untitled', language: 'yaml' },
            { scheme: 'file', language: 'json' },
            { scheme: 'untitled', language: 'json' },
        ],
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher('**/*.{json,yml,yaml}'),
        },
    }

    // Create the language client and start the client.
    const client = new LanguageClient(
        'documents',
        localize('documents.server.name', 'AWS Documents Language Server'),
        serverOptions,
        clientOptions
    )

    const disposable = client.start()
    toDispose.push(disposable)

    return client
}
