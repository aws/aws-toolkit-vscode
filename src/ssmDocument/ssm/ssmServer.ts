/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/*!
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { JsonLS, getLanguageServiceSSM as getLanguageService } from 'aws-ssm-document-language-service'

import {
    createConnection,
    DidChangeWatchedFilesParams,
    FileEvent,
    IConnection,
    InitializeParams,
    InitializeResult,
    NotificationType,
    RequestType,
    ServerCapabilities,
    TextDocuments,
    TextDocumentSyncKind,
} from 'vscode-languageserver'

import { posix } from 'path'
import { clearTimeout, setTimeout } from 'timers'
import * as URL from 'url'
import { getLanguageModelCache } from '../../shared/languageServer/languageModelCache'
import { formatError, runSafe, runSafeAsync } from '../../shared/languageServer/utils/runner'

namespace ResultLimitReachedNotification {
    export const type: NotificationType<string, any> = new NotificationType('ssm/resultLimitReached')
}

namespace ForceValidateRequest {
    export const type: RequestType<string, JsonLS.Diagnostic[], any, any> = new RequestType('ssm/validate')
}

// Create a connection for the server
const connection: IConnection = createConnection()

process.on('unhandledRejection', (e: any) => {
    console.error(formatError('Unhandled exception', e))
})
process.on('uncaughtException', (e: any) => {
    console.error(formatError('Unhandled exception', e))
})

console.log = connection.console.log.bind(connection.console)
console.error = connection.console.error.bind(connection.console)

const workspaceContext = {
    resolveRelativePath: (relativePath: string, resource: string) => {
        return URL.resolve(resource, relativePath)
    },
}

// create the JSON language service
let languageService = getLanguageService({
    workspaceContext,
    contributions: [],
    clientCapabilities: JsonLS.ClientCapabilities.LATEST,
})

// Create a text document manager.
const documents = new TextDocuments(JsonLS.TextDocument)

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection)

let clientSnippetSupport = false
let hierarchicalDocumentSymbolSupport = false

let foldingRangeLimitDefault = Number.MAX_VALUE
let foldingRangeLimit = Number.MAX_VALUE
let resultLimit = Number.MAX_VALUE

// After the server has started the client sends an initialize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilities.
connection.onInitialize(
    (params: InitializeParams): InitializeResult => {
        languageService = getLanguageService({
            workspaceContext,
            contributions: [],
            clientCapabilities: params.capabilities,
        })

        // tslint:disable: no-unsafe-any
        function getClientCapability<T>(name: string, def: T) {
            const keys = name.split('.')
            let c: any = params.capabilities
            for (let i = 0; c && i < keys.length; i++) {
                if (!c.hasOwnProperty(keys[i])) {
                    return def
                }
                c = c[keys[i]]
            }

            return c
        }
        // tslint:enable: no-unsafe-any

        clientSnippetSupport = getClientCapability('textDocument.completion.completionItem.snippetSupport', false)
        foldingRangeLimitDefault = getClientCapability('textDocument.foldingRange.rangeLimit', Number.MAX_VALUE)
        hierarchicalDocumentSymbolSupport = getClientCapability(
            'textDocument.documentSymbol.hierarchicalDocumentSymbolSupport',
            false
        )

        // Need all letters to be trigger characters for YAML completion
        const triggerCharacters = [
            '"',
            '-',
            '$',
            'a',
            'b',
            'c',
            'd',
            'e',
            'f',
            'g',
            'h',
            'i',
            'j',
            'k',
            'l',
            'm',
            'n',
            'o',
            'p',
            'q',
            'r',
            's',
            't',
            'u',
            'v',
            'w',
            'x',
            'y',
            'z',
        ]

        const capabilities: ServerCapabilities = {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            completionProvider: clientSnippetSupport
                ? { resolveProvider: true, triggerCharacters: triggerCharacters }
                : undefined,
            hoverProvider: true,
            documentSymbolProvider: true,
            // tslint:disable-next-line: no-unsafe-any
            documentRangeFormattingProvider: params.initializationOptions.provideFormatter === true,
            colorProvider: {},
            foldingRangeProvider: true,
            selectionRangeProvider: true,
        }
        console.log('initialized.')
        return { capabilities }
    }
)

// The settings interface describes the server relevant settings part
export interface Settings {
    ssm?: {
        resultLimit?: number
    }
}

namespace LimitExceededWarnings {
    const pendingWarnings: { [uri: string]: { features: { [name: string]: string }; timeout?: NodeJS.Timeout } } = {}

    export function cancel(uri: string) {
        const warning = pendingWarnings[uri]
        if (warning && warning.timeout) {
            clearTimeout(warning.timeout)
            // tslint:disable-next-line: no-dynamic-delete
            delete pendingWarnings[uri]
        }
    }

    export function onResultLimitExceeded(uri: string, maxResults: number, name: string) {
        return () => {
            let warning = pendingWarnings[uri]
            if (warning) {
                if (!warning.timeout) {
                    // already shown
                    return
                }
                warning.features[name] = name
                warning.timeout.refresh()
            } else {
                warning = { features: { [name]: name } }
                warning.timeout = setTimeout(() => {
                    connection.sendNotification(
                        ResultLimitReachedNotification.type,
                        `${posix.basename(uri)}: For performance reasons, ${Object.keys(warning.features).join(
                            ' and '
                        )} have been limited to ${maxResults} items.`
                    )
                    warning.timeout = undefined
                }, 2000)
                pendingWarnings[uri] = warning
            }
        }
    }
}

connection.onDidChangeConfiguration(change => {
    const settings = <Settings>change.settings

    foldingRangeLimit = Math.trunc(
        settings?.ssm?.resultLimit ? Math.max(settings?.ssm?.resultLimit, 0) : foldingRangeLimitDefault
    )
    resultLimit = Math.trunc(settings?.ssm?.resultLimit ? Math.max(settings?.ssm?.resultLimit, 0) : Number.MAX_VALUE)
})

// Retry schema validation on all open documents
connection.onRequest(ForceValidateRequest.type, async uri => {
    return new Promise<JsonLS.Diagnostic[]>(resolve => {
        const document = documents.get(uri)
        if (document) {
            validateTextDocument(document, diagnostics => {
                resolve(diagnostics)
            })
        } else {
            resolve([])
        }
    })
})

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
    LimitExceededWarnings.cancel(change.document.uri)
    triggerValidation(change.document)
})

// a document has closed: clear all diagnostics
documents.onDidClose(event => {
    LimitExceededWarnings.cancel(event.document.uri)
    cleanPendingValidation(event.document)
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] })
})

const pendingValidationRequests: { [uri: string]: NodeJS.Timer } = {}
const validationDelayMs = 500

function cleanPendingValidation(textDocument: JsonLS.TextDocument): void {
    const request = pendingValidationRequests[textDocument.uri]
    if (request) {
        clearTimeout(request)
        // tslint:disable-next-line: no-dynamic-delete
        delete pendingValidationRequests[textDocument.uri]
    }
}

function triggerValidation(textDocument: JsonLS.TextDocument): void {
    cleanPendingValidation(textDocument)
    pendingValidationRequests[textDocument.uri] = setTimeout(() => {
        // tslint:disable-next-line: no-dynamic-delete
        delete pendingValidationRequests[textDocument.uri]
        validateTextDocument(textDocument)
    }, validationDelayMs)
}

function validateTextDocument(
    textDocument: JsonLS.TextDocument,
    callback?: (diagnostics: JsonLS.Diagnostic[]) => void
): void {
    const jsonDocument = getJSONDocument(textDocument)
    const documentSettings: JsonLS.DocumentLanguageSettings = { comments: 'error', trailingCommas: 'error' }
    const respond = (diagnostics: JsonLS.Diagnostic[]) => {
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics })
        if (callback) {
            callback(diagnostics)
        }
    }

    // Validate base on json schema provided for SSM Document
    languageService.doValidation(textDocument, jsonDocument, documentSettings).then(
        diagnostics => {
            setTimeout(() => {
                const currDocument = documents.get(textDocument.uri)
                if (currDocument) {
                    respond(diagnostics) // Send the computed diagnostics to VSCode.
                }
            }, 100)
        },
        error => {
            connection.console.error(formatError(`Error while validating ${textDocument.uri}`, error))
        }
    )
}

connection.onDidChangeWatchedFiles((change: DidChangeWatchedFilesParams) => {
    // Monitored files have changed in VSCode
    let hasChanges = false

    change.changes.forEach((c: FileEvent) => {
        if (languageService.resetSchema(c.uri)) {
            hasChanges = true
        }
    })
    if (hasChanges) {
        documents.all().forEach(triggerValidation)
    }
})

const jsonDocuments = getLanguageModelCache<JsonLS.JSONDocument>(10, 60, document =>
    languageService.parseJSONDocument(document)
)
documents.onDidClose(e => {
    jsonDocuments.onDocumentRemoved(e.document)
})
connection.onShutdown(() => {
    jsonDocuments.dispose()
})

function getJSONDocument(document: JsonLS.TextDocument): JsonLS.JSONDocument {
    return jsonDocuments.get(document)
}

connection.onCompletion((textDocumentPosition, token) => {
    return runSafeAsync(
        async () => {
            const document = documents.get(textDocumentPosition.textDocument.uri)
            if (document) {
                const jsonDocument = getJSONDocument(document)

                return languageService.doComplete(document, textDocumentPosition.position, jsonDocument)
            }

            return undefined
        },
        undefined,
        `Error while computing completions for ${textDocumentPosition.textDocument.uri}`,
        token
    )
})

connection.onCompletionResolve((completionItem, token) => {
    return runSafeAsync(
        () => {
            return languageService.doResolve(completionItem)
        },
        completionItem,
        'Error while resolving completion proposal',
        token
    )
})

connection.onHover((textDocumentPositionParams, token) => {
    return runSafeAsync(
        async () => {
            const document = documents.get(textDocumentPositionParams.textDocument.uri)
            if (document) {
                const jsonDocument = getJSONDocument(document)
                return languageService.doHover(document, textDocumentPositionParams.position, jsonDocument)
            }

            return undefined
        },
        undefined,
        `Error while computing hover for ${textDocumentPositionParams.textDocument.uri}`,
        token
    )
})

connection.onDocumentSymbol((documentSymbolParams, token) => {
    return runSafe(
        () => {
            // tslint:disable-next-line no-unsafe-any
            const document = documents.get(documentSymbolParams.textDocument.uri)
            if (document) {
                const jsonDocument = getJSONDocument(document)
                const onResultLimitExceeded = LimitExceededWarnings.onResultLimitExceeded(
                    document.uri,
                    resultLimit,
                    'document symbols'
                )
                if (hierarchicalDocumentSymbolSupport) {
                    return languageService.findDocumentSymbols2(document, jsonDocument, {
                        resultLimit,
                        onResultLimitExceeded,
                    })
                } else {
                    return languageService.findDocumentSymbols(document, jsonDocument, {
                        resultLimit,
                        onResultLimitExceeded,
                    })
                }
            }

            return []
        },
        [],
        `Error while computing document symbols for ${documentSymbolParams.textDocument.uri}`,
        token
    )
})

connection.onDocumentRangeFormatting((formatParams, token) => {
    return runSafe(
        () => {
            const document = documents.get(formatParams.textDocument.uri)
            if (document) {
                return languageService.format(document, formatParams.range, formatParams.options)
            }

            return []
        },
        [],
        `Error while formatting range for ${formatParams.textDocument.uri}`,
        token
    )
})

connection.onDocumentColor((params, token) => {
    return runSafeAsync(
        async () => {
            const document = documents.get(params.textDocument.uri)
            if (document) {
                const onResultLimitExceeded = LimitExceededWarnings.onResultLimitExceeded(
                    document.uri,
                    resultLimit,
                    'document colors'
                )
                const jsonDocument = getJSONDocument(document)

                return languageService.findDocumentColors(document, jsonDocument, {
                    resultLimit,
                    onResultLimitExceeded,
                })
            }

            return []
        },
        [],
        `Error while computing document colors for ${params.textDocument.uri}`,
        token
    )
})

connection.onColorPresentation((params, token) => {
    return runSafe(
        () => {
            const document = documents.get(params.textDocument.uri)
            if (document) {
                const jsonDocument = getJSONDocument(document)

                return languageService.getColorPresentations(document, jsonDocument, params.color, params.range)
            }

            return []
        },
        [],
        `Error while computing color presentations for ${params.textDocument.uri}`,
        token
    )
})

connection.onFoldingRanges((params, token) => {
    return runSafe(
        () => {
            const document = documents.get(params.textDocument.uri)
            if (document) {
                const onRangeLimitExceeded = LimitExceededWarnings.onResultLimitExceeded(
                    document.uri,
                    foldingRangeLimit,
                    'folding ranges'
                )

                return languageService.getFoldingRanges(document, {
                    rangeLimit: foldingRangeLimit,
                    onRangeLimitExceeded,
                })
            }

            return undefined
        },
        undefined,
        `Error while computing folding ranges for ${params.textDocument.uri}`,
        token
    )
})

connection.onSelectionRanges((params, token) => {
    return runSafe(
        () => {
            const document = documents.get(params.textDocument.uri)
            if (document) {
                const jsonDocument = getJSONDocument(document)

                return languageService.getSelectionRanges(document, params.positions, jsonDocument)
            }

            return []
        },
        [],
        `Error while computing selection ranges for ${params.textDocument.uri}`,
        token
    )
})

// Listen on the connection
connection.listen()
