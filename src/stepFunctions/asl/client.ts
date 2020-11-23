/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/*!
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 */

import * as path from 'path'
import * as nls from 'vscode-nls'

const localize = nls.loadMessageBundle()

import {
    CancellationToken,
    Disposable,
    ExtensionContext,
    FormattingOptions,
    LanguageConfiguration,
    languages,
    ProviderResult,
    Range,
    TextDocument,
    TextEdit,
    window,
    workspace,
} from 'vscode'

import {
    DidChangeConfigurationNotification,
    DocumentRangeFormattingParams,
    DocumentRangeFormattingRequest,
    LanguageClient,
    LanguageClientOptions,
    NotificationType,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient'

namespace ResultLimitReachedNotification {
    export const type: NotificationType<string, any> = new NotificationType('asl/resultLimitReached')
}

interface Settings {
    asl?: {
        format?: { enable: boolean }
        resultLimit?: number
    }
}

export async function activate(extensionContext: ExtensionContext) {
    const toDispose = extensionContext.subscriptions

    let rangeFormatting: Disposable | undefined

    // The server is implemented in node
    const serverModule = extensionContext.asAbsolutePath(path.join('dist/src/stepFunctions/asl/', 'aslServer.js'))
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
    const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] }

    // If the extension is launch in debug mode the debug server options are use
    // Otherwise the run options are used
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions },
    }

    const documentSelector = [
        { schema: 'file', language: 'asl' },
        { schema: 'untitled', language: 'asl' },
    ]

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        // Register the server for json documents
        documentSelector,
        initializationOptions: {
            handledSchemaProtocols: ['file', 'untitled'], // language server only loads file-URI. Fetching schemas with other protocols ('http'...) are made on the client.
            provideFormatter: false, // tell the server to not provide formatting capability and ignore the `aws.stepfunctions.asl.format.enable` setting.
        },
        synchronize: {
            // Synchronize the setting section 'json' to the server
            configurationSection: ['asl'],
            fileEvents: workspace.createFileSystemWatcher('**/*.{asl.json,asl}'),
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
        'asl',
        localize('asl.server.name', 'Amazon States Language Server'),
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
    languages.setLanguageConfiguration('asl', languageConfiguration)

    function updateFormatterRegistration() {
        const formatEnabled = workspace.getConfiguration().get('aws.stepfunctions.asl.format.enable')
        if (!formatEnabled && rangeFormatting) {
            rangeFormatting.dispose()
            rangeFormatting = undefined
        } else if (formatEnabled && !rangeFormatting) {
            rangeFormatting = languages.registerDocumentRangeFormattingEditProvider(documentSelector, {
                provideDocumentRangeFormattingEdits(
                    document: TextDocument,
                    range: Range,
                    options: FormattingOptions,
                    token: CancellationToken
                ): ProviderResult<TextEdit[]> {
                    const params: DocumentRangeFormattingParams = {
                        textDocument: client.code2ProtocolConverter.asTextDocumentIdentifier(document),
                        range: client.code2ProtocolConverter.asRange(range),
                        options: client.code2ProtocolConverter.asFormattingOptions(options),
                    }

                    return client.sendRequest(DocumentRangeFormattingRequest.type, params, token).then(
                        response => client.protocol2CodeConverter.asTextEdits(response),
                        async error => {
                            client.logFailedRequest(DocumentRangeFormattingRequest.type, error)

                            return Promise.resolve([])
                        }
                    )
                },
            })
        }
    }

    return client.onReady().then(() => {
        updateFormatterRegistration()
        const disposableFunc = { dispose: () => rangeFormatting?.dispose() as void }
        toDispose.push(disposableFunc)
        toDispose.push(
            workspace.onDidChangeConfiguration(
                e => e.affectsConfiguration('html.format.enable') && updateFormatterRegistration()
            )
        )

        client.onNotification(ResultLimitReachedNotification.type, message => {
            window.showInformationMessage(
                `${message}\nUse setting 'aws.stepfunctions.asl.maxItemsComputed' to configure the limit.`
            )
        })
    })
}

export async function deactivate(): Promise<any> {
    return Promise.resolve(undefined)
}

function getSettings(): Settings {
    const resultLimit: number =
        Math.trunc(Math.max(0, Number(workspace.getConfiguration().get('aws.stepfunctions.asl.maxItemsComputed')))) ||
        5000

    return {
        asl: {
            resultLimit,
        },
    }
}
