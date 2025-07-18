/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

/**
 * Shared utility functions for diagnostic operations across AutoDebug components
 */

/**
 * Maps VSCode DiagnosticSeverity to string representation
 */
export function mapDiagnosticSeverity(severity: vscode.DiagnosticSeverity): 'error' | 'warning' | 'info' | 'hint' {
    switch (severity) {
        case vscode.DiagnosticSeverity.Error:
            return 'error'
        case vscode.DiagnosticSeverity.Warning:
            return 'warning'
        case vscode.DiagnosticSeverity.Information:
            return 'info'
        case vscode.DiagnosticSeverity.Hint:
            return 'hint'
        default:
            return 'error'
    }
}

/**
 * Maps string severity to VSCode DiagnosticSeverity
 */
export function mapSeverityToVSCode(severity: 'error' | 'warning' | 'info' | 'hint'): vscode.DiagnosticSeverity {
    switch (severity) {
        case 'error':
            return vscode.DiagnosticSeverity.Error
        case 'warning':
            return vscode.DiagnosticSeverity.Warning
        case 'info':
            return vscode.DiagnosticSeverity.Information
        case 'hint':
            return vscode.DiagnosticSeverity.Hint
        default:
            return vscode.DiagnosticSeverity.Error
    }
}

/**
 * Gets diagnostics for a specific range in a document
 */
export function getDiagnosticsForRange(uri: vscode.Uri, range?: vscode.Range): vscode.Diagnostic[] {
    const allDiagnostics = vscode.languages.getDiagnostics(uri)

    if (!range) {
        return allDiagnostics
    }

    return allDiagnostics.filter((diagnostic) => diagnostic.range.intersection(range) !== undefined)
}

/**
 * Filters diagnostics by severity levels
 */
export function filterDiagnosticsBySeverity(
    diagnostics: vscode.Diagnostic[],
    severities: vscode.DiagnosticSeverity[]
): vscode.Diagnostic[] {
    return diagnostics.filter((diagnostic) => severities.includes(diagnostic.severity))
}

/**
 * Gets only error-level diagnostics
 */
export function getErrorDiagnostics(diagnostics: vscode.Diagnostic[]): vscode.Diagnostic[] {
    return filterDiagnosticsBySeverity(diagnostics, [vscode.DiagnosticSeverity.Error])
}
