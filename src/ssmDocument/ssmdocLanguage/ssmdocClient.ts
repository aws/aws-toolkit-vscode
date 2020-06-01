/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/*!
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 */

import * as path from 'path'
import * as nls from 'vscode-nls'

const localize = nls.loadMessageBundle()

import { workspace, ExtensionContext } from 'vscode'

import {
    DidChangeConfigurationNotification,
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient'

interface Settings {
    ssmdocLanguage?: {
        maxNumberOfProblem: number
    }
}

let client: LanguageClient

export async function activation(context: ExtensionContext) {
    // The server is implemented in node
    let serverModule = context.asAbsolutePath(path.join('dist/src/ssmDocument/ssmdocLanguage', 'ssmdocServer.js'))
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
    let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] }

    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    let serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: debugOptions,
        },
    }

    // Options to control the language client
    let clientOptions: LanguageClientOptions = {
        // Register the server for .ssmdoc documents
        documentSelector: [
            { scheme: 'file', language: 'json', pattern: '**/*.ssmdoc.*' },
            { scheme: 'file', language: 'yaml', pattern: '**/*.ssmdoc.*' },
            { scheme: 'untitle', language: 'json', pattern: '**/*.ssmdoc.*' },
            { scheme: 'untitle', language: 'yaml', pattern: '**/*.ssmdoc.*' },
        ],
        synchronize: {
            // Notify the server about file changes to .ssmdoc files contained in the workspace
            fileEvents: workspace.createFileSystemWatcher('**/*.ssmdoc.{json,yml,yaml}'),
        },
        middleware: {
            workspace: {
                didChangeConfiguration: () =>
                    client.sendNotification(DidChangeConfigurationNotification.type, { settings: getSettings() }),
            },
        },
    }

    // Create the language client and start the client.
    client = new LanguageClient(
        'ssmdocLanguageServer',
        localize('ssmdocLanguage.server.name', 'SSM Document Language Server'),
        serverOptions,
        clientOptions
    )

    // Start the client. This will also launch the server
    client.start()
}

export async function deactivate(): Promise<any> {
    return Promise.resolve(undefined)
}

function getSettings(): Settings {
    const maxNumberOfProblem: number =
        Math.trunc(
            Math.max(0, Number(workspace.getConfiguration().get('aws.ssmDocument.ssmdocLanguage.maxNumberOfProblem')))
        ) || 1000

    return {
        ssmdocLanguage: {
            maxNumberOfProblem,
        },
    }
}
