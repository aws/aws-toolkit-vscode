/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TextDocument } from 'vscode-languageserver-textdocument'
import { Diagnostic } from 'vscode-languageserver-types'
import globals from '../../extensionGlobals'

export class TextDocumentValidator {
    private validationDelayMs: number
    private pendingValidationRequests: { [uri: string]: NodeJS.Timer } = {}
    private validator: (textDocument: TextDocument, callback?: (diagnostics: Diagnostic[]) => void) => void

    constructor(
        textDocumentValidator: (textDocument: TextDocument, callback?: (diagnostics: Diagnostic[]) => void) => void,
        delay = 500
    ) {
        this.validator = textDocumentValidator
        this.validationDelayMs = delay
    }

    cleanPendingValidation(textDocument: TextDocument): void {
        const request = this.pendingValidationRequests[textDocument.uri]
        if (request) {
            globals.clock.clearTimeout(request)
            delete this.pendingValidationRequests[textDocument.uri]
        }
    }

    triggerValidation(textDocument: TextDocument): void {
        this.cleanPendingValidation(textDocument)
        this.pendingValidationRequests[textDocument.uri] = globals.clock.setTimeout(() => {
            delete this.pendingValidationRequests[textDocument.uri]
            this.validator(textDocument)
        }, this.validationDelayMs)
    }
}
