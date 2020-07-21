'use strict'
/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */
Object.defineProperty(exports, '__esModule', { value: true })
exports.validateSchemaVersion = void 0
const vscode_json_languageservice_1 = require('vscode-json-languageservice')
const constants_1 = require('../constants/constants')
const util_1 = require('../util/util')
function checkschemaVersionAndDocType(docType, schemaVersion) {
    switch (docType) {
        case 'command':
            return schemaVersion === '1.2' || schemaVersion === '2.2'
        case 'automation':
            return schemaVersion === '0.3'
    }
    return false
}
function validateSchemaVersion(textDoc) {
    // Validate SchemaVersion based on document type
    const diagnostics = []
    const docType = util_1.findDocumentType(textDoc)
    const docText = textDoc.getText()
    const schemaVersion = util_1.findSchemaVersion(docText)
    const startPos = textDoc.positionAt(docText.indexOf('schemaVersion'))
    const endPos = textDoc.positionAt(docText.indexOf('schemaVersion') + 'schemaVersion'.length)
    if (!docType.length) {
        const diagnostic = {
            severity: vscode_json_languageservice_1.DiagnosticSeverity.Hint,
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
    if (!constants_1.supportedDocumentTypes.find(t => docType === t)) {
        const diagnostic = {
            severity: vscode_json_languageservice_1.DiagnosticSeverity.Hint,
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
        const diagnostic = {
            severity: vscode_json_languageservice_1.DiagnosticSeverity.Error,
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
exports.validateSchemaVersion = validateSchemaVersion
//# sourceMappingURL=validateSchemaVersion.js.map
