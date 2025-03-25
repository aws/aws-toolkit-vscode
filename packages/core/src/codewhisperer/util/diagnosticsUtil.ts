/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import * as crypto from 'crypto'
import { IdeDiagnostic } from '../client/codewhispereruserclient'

export function getDiagnosticsOfCurrentFile(): vscode.Diagnostic[] {
    if (vscode.window.activeTextEditor) {
        return vscode.languages.getDiagnostics(vscode.window.activeTextEditor.document.uri)
    }
    return []
}

export function getDiagnosticsDifferences(
    oldDiagnostics: vscode.Diagnostic[],
    newDiagnostics: vscode.Diagnostic[]
): { added: vscode.Diagnostic[]; removed: vscode.Diagnostic[] } {
    const result: { added: vscode.Diagnostic[]; removed: vscode.Diagnostic[] } = { added: [], removed: [] }

    // Create sets for efficient lookup
    const oldSet = new Set(oldDiagnostics.map((d) => getDiagnosticKey(d)))
    const newSet = new Set(newDiagnostics.map((d) => getDiagnosticKey(d)))

    // Find added diagnostics (present in new but not in old)
    result.added = newDiagnostics.filter((d) => !oldSet.has(getDiagnosticKey(d)))

    // Find removed diagnostics (present in old but not in new)
    result.removed = oldDiagnostics.filter((d) => !newSet.has(getDiagnosticKey(d)))

    return result
}

export function toIdeDiagnostics(diagnostic: vscode.Diagnostic): IdeDiagnostic {
    return {
        ideDiagnosticType: getDiagnosticsType(diagnostic.message),
        severity: diagnostic.severity.toString(),
        source: diagnostic.source,
        range: diagnostic.range,
    }
}

function getDiagnosticsType(message: string): string {
    // Convert message to lowercase for case-insensitive matching
    const lowercaseMessage = message.toLowerCase()
    // Syntax Error keywords
    if (['expected', 'indent', 'syntax'].some((keyword) => lowercaseMessage.includes(keyword))) {
        return 'SYNTAX_ERROR'
    }

    // Type Error keywords
    if (['type', 'cast'].some((keyword) => lowercaseMessage.includes(keyword))) {
        return 'TYPE_ERROR'
    }

    // Reference Error keywords
    if (['undefined', 'not defined', 'undeclared', 'reference'].some((keyword) => lowercaseMessage.includes(keyword))) {
        return 'REFERENCE_ERROR'
    }

    // Best Practice keywords
    if (
        ['deprecated', 'unused', 'uninitialized', 'not initialized'].some((keyword) =>
            lowercaseMessage.includes(keyword)
        )
    ) {
        return 'BEST_PRACTICE'
    }

    // Security keywords
    if (['security', 'vulnerability'].some((keyword) => lowercaseMessage.includes(keyword))) {
        return 'SECURITY'
    }

    return 'OTHER'
}

function getDiagnosticKey(diagnostic: vscode.Diagnostic): string {
    const jsonStr = JSON.stringify({
        message: diagnostic.message,
        severity: diagnostic.severity,
        code: diagnostic.code,
        source: diagnostic.source,
        range: {
            start: {
                line: diagnostic.range.start.line,
                character: diagnostic.range.start.character,
            },
            end: {
                line: diagnostic.range.end.line,
                character: diagnostic.range.end.character,
            },
        },
    })

    return crypto.createHash('md5').update(jsonStr).digest('hex')
}
