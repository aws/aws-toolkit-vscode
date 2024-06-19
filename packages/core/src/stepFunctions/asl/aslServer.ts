/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/*!
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 */

import {
    ClientCapabilities as aslClientCapabilities,
    DocumentLanguageSettings,
    getLanguageService as getAslJsonLanguageService,
    getYamlLanguageService as getAslYamlLanguageService,
    JSONDocument,
    LanguageService,
    TextDocument,
} from 'amazon-states-language-service'
import {
    createConnection,
    Diagnostic,
    Disposable,
    DocumentRangeFormattingRequest,
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
import * as URL from 'url'
import { getLanguageModelCache } from '../../shared/languageServer/languageModelCache'
import { formatError, runSafe, runSafeAsync } from '../../shared/languageServer/utils/runner'
import { YAML_ASL, JSON_ASL } from '../constants/aslFormats'
import globals from '../../shared/extensionGlobals'

export const ResultLimitReached: NotificationType<string, any> = new NotificationType('asl/resultLimitReached')

export const ForceValidateRequest: RequestType<string, Diagnostic[], any, any> = new RequestType('asl/validate')

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
let aslJsonLanguageService = getAslJsonLanguageService({
    workspaceContext,
    contributions: [],
    clientCapabilities: aslClientCapabilities.LATEST,
})
// create the YAML language service
let aslYamlLanguageService = getAslYamlLanguageService({
    workspaceContext,
    contributions: [],
    clientCapabilities: aslClientCapabilities.LATEST,
})

// Create a text document manager.
const documents = new TextDocuments(TextDocument)

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection)

let clientSnippetSupport = false
let dynamicFormatterRegistration = false
let hierarchicalDocumentSymbolSupport = false

let foldingRangeLimitDefault = Number.MAX_VALUE
let foldingRangeLimit = Number.MAX_VALUE
let resultLimit = Number.MAX_VALUE

// After the server has started the client sends an initialize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilities.
connection.onInitialize((params: InitializeParams): InitializeResult => {
    aslJsonLanguageService = getAslJsonLanguageService({
        workspaceContext,
        contributions: [],
        clientCapabilities: params.capabilities,
    })

    aslYamlLanguageService = getAslYamlLanguageService({
        workspaceContext,
        contributions: [],
        clientCapabilities: params.capabilities,
    })

    function getClientCapability<T>(name: string, def: T) {
        const keys = name.split('.')
        let c: any = params.capabilities
        for (let i = 0; c && i < keys.length; i++) {
            if (!Object.prototype.hasOwnProperty.call(c, keys[i])) {
                return def
            }
            c = c[keys[i]]
        }

        return c
    }

    clientSnippetSupport = getClientCapability('textDocument.completion.completionItem.snippetSupport', false)
    dynamicFormatterRegistration =
        getClientCapability('textDocument.rangeFormatting.dynamicRegistration', false) &&
        typeof params.initializationOptions.provideFormatter !== 'boolean'
    foldingRangeLimitDefault = getClientCapability('textDocument.foldingRange.rangeLimit', Number.MAX_VALUE)
    hierarchicalDocumentSymbolSupport = getClientCapability(
        'textDocument.documentSymbol.hierarchicalDocumentSymbolSupport',
        false
    )
    const capabilities: ServerCapabilities = {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        completionProvider: clientSnippetSupport ? { resolveProvider: true, triggerCharacters: ['"'] } : undefined,
        hoverProvider: true,
        documentSymbolProvider: true,
        documentRangeFormattingProvider: params.initializationOptions.provideFormatter === true,
        colorProvider: {},
        foldingRangeProvider: true,
        selectionRangeProvider: true,
    }

    return { capabilities }
})

// The settings interface describes the server relevant settings part
interface Settings {
    aws?: {
        stepfunctions?: {
            asl?: {
                format?: { enable: boolean }
                resultLimit?: number
            }
        }
    }
}

class LimitExceededWarnings {
    static pendingWarnings: { [uri: string]: { features: { [name: string]: string }; timeout?: NodeJS.Timeout } } = {}

    public static cancel(uri: string) {
        const warning = LimitExceededWarnings.pendingWarnings[uri]
        if (warning && warning.timeout) {
            globals.clock.clearTimeout(warning.timeout)
            delete LimitExceededWarnings.pendingWarnings[uri]
        }
    }

    public static onResultLimitExceeded(uri: string, maxResults: number, name: string) {
        return () => {
            let warning = LimitExceededWarnings.pendingWarnings[uri]
            if (warning) {
                if (!warning.timeout) {
                    // already shown
                    return
                }
                warning.features[name] = name
                warning.timeout.refresh()
            } else {
                warning = { features: { [name]: name } }
                warning.timeout = globals.clock.setTimeout(() => {
                    connection.sendNotification(
                        ResultLimitReached,
                        `${posix.basename(uri)}: For performance reasons, ${Object.keys(warning.features).join(
                            ' and '
                        )} have been limited to ${maxResults} items.`
                    )
                    warning.timeout = undefined
                }, 2000)
                LimitExceededWarnings.pendingWarnings[uri] = warning
            }
        }
    }
}

let formatterRegistration: Thenable<Disposable> | undefined

connection.onDidChangeConfiguration(change => {
    const settings = <Settings>change.settings

    foldingRangeLimit = Math.trunc(
        Math.max(settings?.aws?.stepfunctions?.asl?.resultLimit || foldingRangeLimitDefault, 0)
    )
    resultLimit = Math.trunc(Math.max(settings?.aws?.stepfunctions?.asl?.resultLimit || Number.MAX_VALUE, 0))

    // dynamically enable & disable the formatter
    if (dynamicFormatterRegistration) {
        const enableFormatter = settings?.aws?.stepfunctions?.asl?.format?.enable
        if (enableFormatter) {
            if (!formatterRegistration) {
                formatterRegistration = connection.client.register(DocumentRangeFormattingRequest.type, {
                    documentSelector: [{ language: JSON_ASL }, { language: YAML_ASL }],
                })
            }
        } else if (formatterRegistration) {
            formatterRegistration.then(
                r => r.dispose(),
                e => {
                    console.error('formatterRegistration failed: %s', (e as Error).message)
                }
            )
            formatterRegistration = undefined
        }
    }
})

// Retry schema validation on all open documents
connection.onRequest(ForceValidateRequest, async uri => {
    return new Promise<Diagnostic[]>(resolve => {
        const document = documents.get(uri)
        if (document) {
            // updateConfiguration()
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

function cleanPendingValidation(textDocument: TextDocument): void {
    const request = pendingValidationRequests[textDocument.uri]
    if (request) {
        globals.clock.clearTimeout(request)
        delete pendingValidationRequests[textDocument.uri]
    }
}

function triggerValidation(textDocument: TextDocument): void {
    cleanPendingValidation(textDocument)
    pendingValidationRequests[textDocument.uri] = globals.clock.setTimeout(() => {
        delete pendingValidationRequests[textDocument.uri]
        validateTextDocument(textDocument)
    }, validationDelayMs)
}

// sets language service depending on document language
function getLanguageService(langId: string): LanguageService {
    if (langId === YAML_ASL) {
        return aslYamlLanguageService
    } else {
        return aslJsonLanguageService
    }
}

function validateTextDocument(textDocument: TextDocument, callback?: (diagnostics: Diagnostic[]) => void): void {
    const respond = (diagnostics: Diagnostic[]) => {
        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics })
        if (callback) {
            callback(diagnostics)
        }
    }
    if (textDocument.getText().length === 0) {
        respond([])

        return
    }
    const jsonDocument = getJSONDocument(textDocument)
    const version = textDocument.version

    const documentSettings: DocumentLanguageSettings = { comments: 'error', trailingCommas: 'error' }
    getLanguageService(textDocument.languageId)
        .doValidation(textDocument, jsonDocument, documentSettings)
        .then(
            diagnostics => {
                globals.clock.setTimeout(() => {
                    const currDocument = documents.get(textDocument.uri)
                    if (currDocument && currDocument.version === version) {
                        respond(diagnostics) // Send the computed diagnostics to VSCode.
                    }
                }, 100)
            },
            error => {
                connection.console.error(formatError(`Error while validating ${textDocument.uri}`, error))
            }
        )
}

connection.onDidChangeWatchedFiles(change => {
    // Monitored files have changed in VSCode
    let hasChanges = false
    change.changes.forEach(c => {
        if (getLanguageService('asl').resetSchema(c.uri)) {
            hasChanges = true
        }
    })
    if (hasChanges) {
        documents.all().forEach(triggerValidation)
    }
})

const jsonDocuments = getLanguageModelCache<JSONDocument>(10, 60, document =>
    getLanguageService('asl').parseJSONDocument(document)
)
documents.onDidClose(e => {
    jsonDocuments.onDocumentRemoved(e.document)
})
connection.onShutdown(() => {
    jsonDocuments.dispose()
})

function getJSONDocument(document: TextDocument): JSONDocument {
    return jsonDocuments.get(document)
}

connection.onCompletion((textDocumentPosition, token) => {
    return runSafeAsync(
        async () => {
            const document = documents.get(textDocumentPosition.textDocument.uri)
            if (document) {
                const jsonDocument = getJSONDocument(document)
                const completions = await getLanguageService(document.languageId).doComplete(
                    document,
                    textDocumentPosition.position,
                    jsonDocument
                )
                return completions
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
            // the asl-yaml-languageservice uses doResolve from the asl service
            return getLanguageService('asl').doResolve(completionItem)
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
                return getLanguageService(document.languageId).doHover(
                    document,
                    textDocumentPositionParams.position,
                    jsonDocument
                )
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
            const document = documents.get(documentSymbolParams.textDocument.uri)
            if (document) {
                const jsonDocument = getJSONDocument(document)
                const onResultLimitExceeded = LimitExceededWarnings.onResultLimitExceeded(
                    document.uri,
                    resultLimit,
                    'document symbols'
                )
                if (hierarchicalDocumentSymbolSupport) {
                    return getLanguageService(document.languageId).findDocumentSymbols2(document, jsonDocument, {
                        resultLimit,
                        onResultLimitExceeded,
                    })
                } else {
                    return getLanguageService(document.languageId).findDocumentSymbols(document, jsonDocument, {
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
                return getLanguageService(document.languageId).format(
                    document,
                    formatParams.range,
                    formatParams.options
                )
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

                return getLanguageService(document.languageId).findDocumentColors(document, jsonDocument, {
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

                return getLanguageService(document.languageId).getColorPresentations(
                    document,
                    jsonDocument,
                    params.color,
                    params.range
                )
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
                return getLanguageService(document.languageId).getFoldingRanges(document, {
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

                return getLanguageService(document.languageId).getSelectionRanges(
                    document,
                    params.positions,
                    jsonDocument
                )
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
