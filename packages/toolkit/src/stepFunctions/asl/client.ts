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

import { YAML_ASL, JSON_ASL, ASL_FORMATS } from '../constants/aslFormats'
import { StepFunctionsSettings } from '../utils'

export const ResultLimitReached: NotificationType<string, any> = new NotificationType('asl/resultLimitReached')

interface Settings {
    asl?: {
        format?: { enable: boolean }
        resultLimit?: number
    }
}

export async function activate(extensionContext: ExtensionContext) {
    const config = new StepFunctionsSettings()
    const toDispose = extensionContext.subscriptions

    let rangeFormatting: Disposable | undefined

    // The server is implemented in node
    const serverModule = extensionContext.asAbsolutePath(path.join('./dist/src/stepFunctions/asl/', 'aslServer.js'))
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
    const debugOptions = { execArgv: ['--nolazy', '--inspect=6009', '--preserve-symlinks'] }

    // If the extension is launch in debug mode the debug server options are use
    // Otherwise the run options are used
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions },
    }

    const documentSelector = [
        { schema: 'file', language: JSON_ASL },
        { schema: 'untitled', language: JSON_ASL },
        { schema: 'file', language: YAML_ASL },
        { schema: 'untitled', language: YAML_ASL },
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
            configurationSection: ASL_FORMATS,
            fileEvents: workspace.createFileSystemWatcher('**/*.{asl,asl.json,asl.yml,asl.yaml}'),
        },
        middleware: {
            workspace: {
                didChangeConfiguration: () =>
                    client.sendNotification(DidChangeConfigurationNotification.type, { settings: getSettings(config) }),
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
        const formatEnabled = config.get('format.enable', false)
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
        toDispose.push(config.onDidChange(({ key }) => key === 'format.enable' && updateFormatterRegistration()))

        client.onNotification(ResultLimitReached, message => {
            void window.showInformationMessage(
                `${message}\nUse setting 'aws.stepfunctions.asl.maxItemsComputed' to configure the limit.`
            )
        })
    })
}

export async function deactivate(): Promise<any> {
    return Promise.resolve(undefined)
}

function getSettings(config: StepFunctionsSettings): Settings {
    const resultLimit = config.get('maxItemsComputed', 5000)

    return {
        asl: {
            resultLimit,
        },
    }
}
