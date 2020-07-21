/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */

import { Diagnostic, DiagnosticSeverity, TextDocument } from 'vscode-json-languageservice'
import { supportedDocumentTypes } from '../constants/constants'
import { findDocumentType, findSchemaVersion } from '../util/util'

function checkschemaVersionAndDocType(docType: string, schemaVersion: string): boolean {
    switch (docType) {
        case 'command':
            return schemaVersion === '1.2' || schemaVersion === '2.2'
        case 'automation':
            return schemaVersion === '0.3'
    }

    return false
}

export function validateSchemaVersion(textDoc: TextDocument): Diagnostic[] {
    // Validate SchemaVersion based on document type
    const diagnostics: Diagnostic[] = []
    const docType = findDocumentType(textDoc)
    const docText = textDoc.getText()
    const schemaVersion = findSchemaVersion(docText)

    const startPos = textDoc.positionAt(docText.indexOf('schemaVersion'))
    const endPos = textDoc.positionAt(docText.indexOf('schemaVersion') + 'schemaVersion'.length)

    if (!docType.length) {
        const diagnostic: Diagnostic = {
            severity: DiagnosticSeverity.Hint,
            range: {
                start: startPos,
                end: endPos,
            },
            message:
                'Please specify document types by saving the file in the format {document name}.{document type}.ssm.{json, yaml}.',
        }
        diagnostics.push(diagnostic)

        return diagnostics
    }

    if (!supportedDocumentTypes.find(t => docType === t)) {
        const diagnostic: Diagnostic = {
            severity: DiagnosticSeverity.Hint,
            range: {
                start: startPos,
                end: endPos,
            },
            message:
                'Invalid document type for language supports. Currently only command and automation documents are supported.\n\nPlease use filename of format {document name}.{document type}.ssm.{json, yaml}',
        }
        diagnostics.push(diagnostic)

        return diagnostics
    }

    if (!checkschemaVersionAndDocType(docType, schemaVersion)) {
        const diagnostic: Diagnostic = {
            severity: DiagnosticSeverity.Error,
            range: {
                start: startPos,
                end: endPos,
            },
            message: `Invalid schemaVersion for a ${docType} document.`,
        }
        diagnostics.push(diagnostic)
    }

    return diagnostics
}
