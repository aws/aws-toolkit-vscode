/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as nls from 'vscode-nls'

import { readFile } from 'fs-extra'
import { getPortPromise } from 'portfinder'

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

import { Settings } from './ssmServer'

namespace ResultLimitReachedNotification {
    export const type: NotificationType<string, any> = new NotificationType('ssm/resultLimitReached')
}

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

interface LaunchJSON {
    version: string
    configurations: {
        name: string
        port?: number
    }[]
    compounds: {
        name: string
        configuarations: string[]
    }[]
}

const SSMDOCUMENT_LANGUAGESERVER_DEFAULTPORT = 6010

async function getLanguageServerDebuggerPort(extensionContext: ExtensionContext): Promise<number> {
    // get the port from launch.json or use 6010 as default if not set
    const launchJSONString: string = await readFile(
        path.join(extensionContext.extensionPath, '.vscode', 'launch.json'),
        {
            encoding: 'utf8',
        }
    )

    const commentRemoved = launchJSONString
        .split('\n')
        .map(line => {
            if (!line.startsWith('//')) {
                return line
            }
        })
        .join('\n')

    const launchJSON: LaunchJSON = JSON.parse(commentRemoved)
    const launchPort =
        launchJSON.configurations.find(config => config.name === 'Attach to SSM Document Language Server')?.port ||
        SSMDOCUMENT_LANGUAGESERVER_DEFAULTPORT

    return getPortPromise({ port: launchPort })
}

export async function activate(extensionContext: ExtensionContext) {
    const toDispose = extensionContext.subscriptions

    // The server is implemented in node
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
        client.onNotification(ResultLimitReachedNotification.type, message => {
            window.showInformationMessage(
                `${message}\nUse setting 'aws.ssmDocument.ssm.maxItemsComputed' to configure the limit.`
            )
        })
    })
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
