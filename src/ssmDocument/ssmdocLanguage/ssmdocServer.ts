/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/*!
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 */
import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    //DidChangeConfigurationNotification,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    InitializeResult,
    Diagnostic,
    //DocumentHighlightRequest
} from 'vscode-languageserver'

import { TextDocument } from 'vscode-languageserver-textdocument'
import { getSsmActionCompletion } from './ssmdocCompletion'
import { validateVariableParameters } from './ssmdocValidation'

//import { runSafeAsync } from '../../stepFunctions/asl/utils/runner'

const connection = createConnection(ProposedFeatures.all)
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument)

let clientSnippetSupport = false
//let hasConfigurationCapability: boolean = false
let hasWorkspaceFolderCapability: boolean = false
let hasDiagnosticRelatedInformationCapability: boolean = false

let maxNumberOfProblem = Number.MAX_VALUE

connection.onInitialize(
    (params: InitializeParams): InitializeResult => {
        let capabilities = params.capabilities

        /* hasConfigurationCapability = !!(
            capabilities.workspace && !!capabilities.workspace.configuration
        ); */
        clientSnippetSupport = !!(
            capabilities.textDocument &&
            capabilities.textDocument.completion &&
            capabilities.textDocument.completion.completionItem &&
            capabilities.textDocument.completion.completionItem.snippetSupport
        )
        hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders)
        hasDiagnosticRelatedInformationCapability = !!(
            capabilities.textDocument &&
            capabilities.textDocument.publishDiagnostics &&
            capabilities.textDocument.publishDiagnostics.relatedInformation
        )

        const result: InitializeResult = {
            capabilities: {
                textDocumentSync: TextDocumentSyncKind.Incremental,
                completionProvider: {
                    triggerCharacters: ['$', ':', '-'],
                },
            },
        }
        if (hasWorkspaceFolderCapability) {
            result.capabilities.workspace = {
                workspaceFolders: {
                    supported: true,
                },
            }
        }
        return result
    }
)

interface Settings {
    aws?: {
        ssmDocument?: {
            ssmdocLanguage?: {
                maxNumberOfProblems: number
            }
        }
    }
}

connection.onDidChangeConfiguration(change => {
    const settings = <Settings>change.settings

    maxNumberOfProblem = Math.trunc(
        Math.max(settings?.aws?.ssmDocument?.ssmdocLanguage?.maxNumberOfProblems || Number.MAX_VALUE, 0)
    )

    // Revalidate all open document
    documents.all().forEach(validateTextDocument)
})

documents.onDidChangeContent(change => {
    validateTextDocument(change.document)
})

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
    const context = { maxNumberOfProblem, hasDiagnosticRelatedInformationCapability }
    const diagnostics: Diagnostic[] = validateVariableParameters(textDocument, context)

    // Send the computed diagnostics to VSCode.
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics })
}

connection.onCompletion((textDocumentPosition: TextDocumentPositionParams, _token) => {
    const document = documents.get(textDocumentPosition.textDocument.uri)
    if (!document) {
        return []
    }
    return getSsmActionCompletion(document)
})

documents.listen(connection)
connection.listen()
