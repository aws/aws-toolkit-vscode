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
    Diagnostic,
    DiagnosticSeverity,
    ProposedFeatures,
    InitializeParams,
    //DidChangeConfigurationNotification,
    //CompletionItem,
    //CompletionItemKind,
    //TextDocumentPositionParams,
    TextDocumentSyncKind,
    InitializeResult,
    //DocumentHighlightRequest
} from 'vscode-languageserver'

import { TextDocument } from 'vscode-languageserver-textdocument'

import * as YAML from 'yaml'

const connection = createConnection(ProposedFeatures.all)
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument)

//let clientSnippetSupport = false;
//let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false
let hasDiagnosticRelatedInformationCapability: boolean = false

let maxNumberOfProblem = Number.MAX_VALUE

connection.onInitialize(
    (params: InitializeParams): InitializeResult => {
        let capabilities = params.capabilities

        /* hasConfigurationCapability = !!(
            capabilities.workspace && !!capabilities.workspace.configuration
        ); */
        hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders)
        hasDiagnosticRelatedInformationCapability = !!(
            capabilities.textDocument &&
            capabilities.textDocument.publishDiagnostics &&
            capabilities.textDocument.publishDiagnostics.relatedInformation
        )

        const result: InitializeResult = {
            capabilities: {
                textDocumentSync: TextDocumentSyncKind.Incremental,
                // Tell the client that the server supports code completion
                completionProvider: {
                    resolveProvider: true,
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

function getVariableName(text: string) {
    let start = text.lastIndexOf('{') + 1
    let end = text.indexOf('}')

    return text.substring(start, end).trim()
}

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
    let problems = 0
    let diagnostics: Diagnostic[] = []

    /* The validator creates diagnostics for all variables of format {{ VAR_NAME }}
     * and checks whether the corresponding VARNAME appeared under parameters
     */
    let docText = textDocument.getText()
    let varPattern = /{{[ ]?\w+[ ]?}}/g
    let vars: RegExpExecArray | null

    while ((vars = varPattern.exec(docText)) && problems < maxNumberOfProblem) {
        let obj: any
        try {
            if (textDocument.languageId === 'json') {
                obj = JSON.parse(docText)
            } else {
                obj = YAML.parse(docText)
            }
        } catch (err) {
            let diagnostic: Diagnostic = {
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: textDocument.positionAt(vars.index),
                    end: textDocument.positionAt(vars.index + vars[0].length),
                },
                message: err.message,
                source: 'AWS Toolkit (Extension)',
            }
            diagnostics.push(diagnostic)
        }

        let varName = getVariableName(vars[0])
        if (!obj.hasOwnProperty('parameters')) {
            let diagnostic: Diagnostic = {
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: textDocument.positionAt(vars.index),
                    end: textDocument.positionAt(vars.index + vars[0].length),
                },
                message: `${varName} should be a parameter.`,
                source: 'AWS Toolkit (Extension)',
            }
            if (hasDiagnosticRelatedInformationCapability) {
                diagnostic.relatedInformation = [
                    {
                        location: {
                            uri: textDocument.uri,
                            range: Object.assign({}, diagnostic.range),
                        },
                        message: 'Missing required property "parameters".',
                    },
                ]
            }
            diagnostics.push(diagnostic)
        } else {
            if (!obj.parameters.hasOwnProperty(varName)) {
                let diagnostic: Diagnostic = {
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: textDocument.positionAt(vars.index),
                        end: textDocument.positionAt(vars.index + vars[0].length),
                    },
                    message: `${varName} should be a parameter.`,
                    source: 'AWS Toolkit (extension)',
                }
                if (hasDiagnosticRelatedInformationCapability) {
                    diagnostic.relatedInformation = [
                        {
                            location: {
                                uri: textDocument.uri,
                                range: Object.assign({}, diagnostic.range),
                            },
                            message: `Missing required property ${varName} under \"parameters\".`,
                        },
                    ]
                }
                diagnostics.push(diagnostic)
            }
        }
    }

    // Send the computed diagnostics to VSCode.
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics })
}

documents.listen(connection)
connection.listen()
