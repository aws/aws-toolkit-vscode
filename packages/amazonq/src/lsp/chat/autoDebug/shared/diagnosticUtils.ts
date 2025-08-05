/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { toIdeDiagnostics } from 'aws-core-vscode/codewhisperer'

/**
 * Maps VSCode DiagnosticSeverity to string representation
 * Reuses the existing toIdeDiagnostics logic but returns lowercase format expected by Problem interface
 */
export function mapDiagnosticSeverity(severity: vscode.DiagnosticSeverity): 'error' | 'warning' | 'info' | 'hint' {
    // Create a minimal diagnostic to use with toIdeDiagnostics
    const tempDiagnostic: vscode.Diagnostic = {
        range: new vscode.Range(0, 0, 0, 0),
        message: '',
        severity: severity,
    }

    const ideDiagnostic = toIdeDiagnostics(tempDiagnostic)
    // Convert uppercase severity to lowercase format expected by Problem interface
    switch (ideDiagnostic.severity) {
        case 'ERROR':
            return 'error'
        case 'WARNING':
            return 'warning'
        case 'INFORMATION':
            return 'info'
        case 'HINT':
            return 'hint'
        default:
            return 'error'
    }
}
