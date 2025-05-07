/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import * as crypto from 'crypto'
import { IdeDiagnostic } from '../client/codewhispereruserclient'

export function getDiagnosticsOfCurrentFile(): FileDiagnostic | undefined {
    if (vscode.window.activeTextEditor) {
        return {
            diagnostics: vscode.languages.getDiagnostics(vscode.window.activeTextEditor.document.uri),
            filepath: vscode.window.activeTextEditor.document.uri.fsPath,
        }
    }
    return undefined
}

export type FileDiagnostic = {
    filepath: string
    diagnostics: vscode.Diagnostic[]
}

export function getDiagnosticsDifferences(
    oldDiagnostics: FileDiagnostic | undefined,
    newDiagnostics: FileDiagnostic | undefined
): { added: vscode.Diagnostic[]; removed: vscode.Diagnostic[] } {
    const result: { added: vscode.Diagnostic[]; removed: vscode.Diagnostic[] } = { added: [], removed: [] }
    if (
        oldDiagnostics === undefined ||
        newDiagnostics === undefined ||
        newDiagnostics.filepath !== oldDiagnostics.filepath
    ) {
        return result
    }

    // Create maps using diagnostic key for uniqueness
    const oldMap = new Map(oldDiagnostics.diagnostics.map((d) => [getDiagnosticKey(d), d]))
    const newMap = new Map(newDiagnostics.diagnostics.map((d) => [getDiagnosticKey(d), d]))

    // Get added diagnostics (in new but not in old)
    result.added = [...newMap.values()].filter((d) => !oldMap.has(getDiagnosticKey(d)))

    // Get removed diagnostics (in old but not in new)
    result.removed = [...oldMap.values()].filter((d) => !newMap.has(getDiagnosticKey(d)))

    return result
}

export function toIdeDiagnostics(diagnostic: vscode.Diagnostic): IdeDiagnostic {
    const severity =
        diagnostic.severity === vscode.DiagnosticSeverity.Error
            ? 'ERROR'
            : diagnostic.severity === vscode.DiagnosticSeverity.Warning
              ? 'WARNING'
              : diagnostic.severity === vscode.DiagnosticSeverity.Hint
                ? 'HINT'
                : 'INFORMATION'

    return {
        ideDiagnosticType: getDiagnosticsType(diagnostic.message),
        severity: severity,
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
    }
}

export function getDiagnosticsType(message: string): string {
    const errorTypes = new Map([
        ['SYNTAX_ERROR', ['expected', 'indent', 'syntax']],
        ['TYPE_ERROR', ['type', 'cast']],
        ['REFERENCE_ERROR', ['undefined', 'not defined', 'undeclared', 'reference']],
        ['BEST_PRACTICE', ['deprecated', 'unused', 'uninitialized', 'not initialized']],
        ['SECURITY', ['security', 'vulnerability']],
    ])

    const lowercaseMessage = message.toLowerCase()

    for (const [errorType, keywords] of errorTypes) {
        if (keywords.some((keyword) => lowercaseMessage.includes(keyword))) {
            return errorType
        }
    }

    return 'OTHER'
}

/**
 * Generates a unique MD5 hash key for a VS Code diagnostic object.
 *
 * @param diagnostic - A VS Code Diagnostic object containing information about a code diagnostic
 * @returns A 32-character hexadecimal MD5 hash string that uniquely identifies the diagnostic
 *
 * @description
 * Creates a deterministic hash by combining the diagnostic's message, severity, code, and source.
 * This hash can be used as a unique identifier for deduplication or tracking purposes.
 * Note: range is not in the hashed string because a diagnostic can move and its range can change within the editor
 */
function getDiagnosticKey(diagnostic: vscode.Diagnostic): string {
    const jsonStr = JSON.stringify({
        message: diagnostic.message,
        severity: diagnostic.severity,
        code: diagnostic.code,
        source: diagnostic.source,
    })

    return crypto.createHash('md5').update(jsonStr).digest('hex')
}
