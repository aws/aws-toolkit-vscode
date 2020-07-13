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

import { ExtensionContext, LanguageConfiguration, languages, window, workspace } from 'vscode'

import {
    DidChangeConfigurationNotification,
    LanguageClient,
    LanguageClientOptions,
    NotificationType,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient'

namespace ResultLimitReachedNotification {
    export const type: NotificationType<string, any> = new NotificationType('ssm/resultLimitReached')
}

interface Settings {
    ssm?: {
        format?: { enable: boolean }
        resultLimit?: number
    }
}

export async function activate(extensionContext: ExtensionContext) {
    const toDispose = extensionContext.subscriptions

    // The server is implemented in node
    const serverModule = extensionContext.asAbsolutePath(path.join('dist/src/ssmDocument/ssm/', 'ssmServer.js'))
    // The debug options for the server
    // --inspect=6010: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
    const debugOptions = { execArgv: ['--nolazy', '--inspect=6010'] }

    // If the extension is launch in debug mode the debug server options are use
    // Otherwise the run options are used
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions },
    }

    const documentSelector = [
        { schema: 'file', language: 'ssm-json' },
        { schema: 'untitled', language: 'ssm-json' },
        { schema: 'file', language: 'ssm-yaml' },
        { schema: 'untitled', language: 'ssm-yaml' },
    ]

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        // Register the server for json documents
        documentSelector,
        initializationOptions: {
            handledSchemaProtocols: ['file', 'untitled'], // language server only loads file-URI. Fetching schemas with other protocols ('http'...) are made on the client.
            provideFormatter: false,
        },
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher('**/*.ssm.{json,yml,yaml}'),
        },
        middleware: {
            workspace: {
                didChangeConfiguration: () =>
                    client.sendNotification(DidChangeConfigurationNotification.type, { settings: getSettings() }),
            },
        },
    }

    // Create the language client and start the client.
    const client = new LanguageClient(
        'ssm',
        localize('ssm.server.name', 'SSM Document Language Server'),
        serverOptions,
        clientOptions
    )
    client.registerProposedFeatures()

    const disposable = client.start()
    toDispose.push(disposable)

    const languageConfiguration: LanguageConfiguration = {
        wordPattern: /("(?:[^\\\"]*(?:\\.)?)*"?)|[^\s{}\[\],:]+/,
        indentationRules: {
            increaseIndentPattern: /({+(?=([^"]*"[^"]*")*[^"}]*$))|(\[+(?=([^"]*"[^"]*")*[^"\]]*$))/,
            decreaseIndentPattern: /^\s*[}\]],?\s*$/,
        },
    }
    languages.setLanguageConfiguration('ssm-json', languageConfiguration)
    languages.setLanguageConfiguration('ssm-yaml', languageConfiguration)

    return client.onReady().then(() => {
        client.onNotification(ResultLimitReachedNotification.type, message => {
            window.showInformationMessage(
                `${message}\nUse setting 'aws.ssmDocument.ssm.maxItemsComputed' to configure the limit.`
            )
        })
    })
}

export async function deactivate(): Promise<any> {
    return Promise.resolve(undefined)
}

function getSettings(): Settings {
    const resultLimit: number =
        Math.trunc(Math.max(0, Number(workspace.getConfiguration().get('aws.ssmDocument.ssm.maxItemsComputed')))) ||
        5000

    return {
        ssm: {
            resultLimit,
        },
    }
}
