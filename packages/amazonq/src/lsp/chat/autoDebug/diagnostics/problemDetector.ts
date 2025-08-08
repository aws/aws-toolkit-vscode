/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

export interface Problem {
    readonly uri: vscode.Uri
    readonly diagnostic: vscode.Diagnostic
    readonly severity: 'error' | 'warning' | 'info' | 'hint'
    readonly source: string
    readonly isNew: boolean
}

export interface CategorizedProblems {
    readonly errors: Problem[]
    readonly warnings: Problem[]
    readonly info: Problem[]
    readonly hints: Problem[]
}
