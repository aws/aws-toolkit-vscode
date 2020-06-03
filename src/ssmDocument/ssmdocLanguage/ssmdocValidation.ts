/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TextDocument, Diagnostic, DiagnosticSeverity } from 'vscode-json-languageservice'
import * as YAML from 'yaml'

function getVariableName(text: string) {
    let start = text.lastIndexOf('{') + 1
    let end = text.indexOf('}')

    return text.substring(start, end).trim()
}

export function validateVariableParameters(
    textDocument: TextDocument,
    context: { maxNumberOfProblem: number; hasDiagnosticRelatedInformationCapability: boolean }
): Diagnostic[] {
    let problems = 0
    let diagnostics: Diagnostic[] = []

    /* The validator creates diagnostics for all variables of format {{ VAR_NAME }}
     * and checks whether the corresponding VARNAME appeared under parameters
     */
    let docText = textDocument.getText()
    let varPattern = /{{[ ]?\w+[ ]?}}/g
    let vars: RegExpExecArray | null

    while ((vars = varPattern.exec(docText)) && problems < context.maxNumberOfProblem) {
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
                source: 'AWS Toolkit (Extension).',
            }
            diagnostics.push(diagnostic)
            // Fail to parse document (document contains basic JSON/YAML syntax errors)
            return []
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
                source: 'AWS Toolkit (Extension).',
            }
            if (context.hasDiagnosticRelatedInformationCapability) {
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
                    source: 'AWS Toolkit (extension).',
                }
                if (context.hasDiagnosticRelatedInformationCapability) {
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

    return diagnostics
}
