/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as nls from 'vscode-nls'

import { getPortPromise } from 'portfinder'
import { EnvironmentVariables } from '../../shared/environmentVariables'

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

export const ResultLimitReached: NotificationType<string, any> = new NotificationType('ssm/resultLimitReached')

const jsonLanguageConfiguration: LanguageConfiguration = {
    wordPattern: /("(?:[^\\\"]*(?:\\.)?)*"?)|[^\s{}\[\],:]+/,
    indentationRules: {
        increaseIndentPattern: /({+(?=([^"]*"[^"]*")*[^"}]*$))|(\[+(?=([^"]*"[^"]*")*[^"\]]*$))/,
        decreaseIndentPattern: /^\s*[}\]],?\s*$/,
    },
}

const yamlLanguageConfiguration: LanguageConfiguration = {
    indentationRules: {
        increaseIndentPattern: /^\\s*.*(:|-) ?(&amp;\\w+)?(\\{[^}\"']*|\\\([^)\"']*)?$/,
        decreaseIndentPattern: /^\\s+\\}$/,
    },
}

const ssmdocumentLanguageserverDefaultport = 6010

async function getLanguageServerDebuggerPort(extensionContext: ExtensionContext): Promise<number> {
    // get the port from env variable or use 6010 as default if not set
    const env = process.env as EnvironmentVariables
    const port = env.SSMDOCUMENT_LANGUAGESERVER_PORT
        ? parseInt(env.SSMDOCUMENT_LANGUAGESERVER_PORT as string)
        : ssmdocumentLanguageserverDefaultport

    return getPortPromise({ port: port })
}

/**
 * Starts the SSM Documents LSP client/server and creates related resources (vscode `OutputChannel`).
 */
export async function activate(extensionContext: ExtensionContext) {
    const toDispose = extensionContext.subscriptions

    // The server is implemented in node
    // This file is copied by webpack from "aws-ssm-document-language-service" dependency at build time
    const serverModule = extensionContext.asAbsolutePath(path.join('dist/src/ssmDocument/ssm/', 'ssmServer.js'))

    // The debug options for the server
    const debuggerPort = await getLanguageServerDebuggerPort(extensionContext)
    // --inspect=${port}: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
    const debugOptions = { execArgv: ['--nolazy', `--inspect=${debuggerPort}`] }

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

    languages.setLanguageConfiguration('ssm-json', jsonLanguageConfiguration)
    languages.setLanguageConfiguration('ssm-yaml', yamlLanguageConfiguration)

    return client.onReady().then(() => {
        client.onNotification(ResultLimitReached, message => {
            void window.showInformationMessage(
                `${message}\nUse setting 'aws.ssmDocument.ssm.maxItemsComputed' to configure the limit.`
            )
        })
    })
}

function getSettings() {
    const resultLimit: number =
        Math.trunc(Math.max(0, Number(workspace.getConfiguration().get('aws.ssmDocument.ssm.maxItemsComputed')))) ||
        5000

    return {
        ssm: {
            resultLimit,
        },
    }
}
