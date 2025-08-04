/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

export interface DiagnosticCollection {
    readonly diagnostics: [vscode.Uri, vscode.Diagnostic[]][]
    readonly timestamp: number
}

export interface DiagnosticSnapshot {
    readonly diagnostics: DiagnosticCollection
    readonly captureTime: number
    readonly id: string
}

export interface FileDiagnostics {
    readonly uri: vscode.Uri
    readonly diagnostics: vscode.Diagnostic[]
}
