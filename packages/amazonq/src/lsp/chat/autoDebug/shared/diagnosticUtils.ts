/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

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
