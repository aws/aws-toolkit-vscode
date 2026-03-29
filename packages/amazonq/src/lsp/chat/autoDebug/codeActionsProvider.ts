/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

/**
 * Provides code actions for Amazon Q Auto Debug features.
 * Integrates with VS Code's quick fix system to offer debugging assistance.
 */
export class AutoDebugCodeActionsProvider implements vscode.CodeActionProvider, vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = []

    public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix, vscode.CodeActionKind.Refactor]

    constructor() {
        this.registerProvider()
    }

    private registerProvider(): void {
        // Register for all file types
        const selector: vscode.DocumentSelector = [{ scheme: 'file' }]

        this.disposables.push(
            vscode.languages.registerCodeActionsProvider(selector, this, {
                providedCodeActionKinds: AutoDebugCodeActionsProvider.providedCodeActionKinds,
            })
        )
    }

    /**
     * Provides code actions for the given document and range
     */
    public provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
        if (token.isCancellationRequested) {
            return []
        }

        const actions: vscode.CodeAction[] = []

        // Get diagnostics for the current range
        const diagnostics = context.diagnostics.filter(
            (diagnostic) => diagnostic.range.intersection(range) !== undefined
        )

        if (diagnostics.length > 0) {
            // Add "Fix with Amazon Q" action
            actions.push(this.createFixWithQAction(document, range, diagnostics))

            // Check if any diagnostic is error or warning to show "Fix All Issues"
            const hasErrorOrWarning = diagnostics.some(
                (d) =>
                    d.severity === vscode.DiagnosticSeverity.Error || d.severity === vscode.DiagnosticSeverity.Warning
            )
            if (hasErrorOrWarning) {
                // If triggered from warning, include warnings; if from error, only errors
                const hasWarning = diagnostics.some((d) => d.severity === vscode.DiagnosticSeverity.Warning)
                actions.push(this.createFixAllWithQAction(document, hasWarning))
            }

            // Add "Explain Problem" action
            actions.push(this.createExplainProblemAction(document, range, diagnostics))
        }
        return actions
    }

    private createFixWithQAction(
        document: vscode.TextDocument,
        range: vscode.Range,
        diagnostics: vscode.Diagnostic[]
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(
            `Amazon Q: Fix Problem (${diagnostics.length} issue${diagnostics.length !== 1 ? 's' : ''})`,
            vscode.CodeActionKind.QuickFix
        )

        action.command = {
            command: 'amazonq.01.fixWithQ',
            title: 'Amazon Q: Fix Problem',
            arguments: [range, diagnostics],
        }

        action.diagnostics = diagnostics
        action.isPreferred = true // Make this the preferred quick fix

        return action
    }

    private createFixAllWithQAction(document: vscode.TextDocument, includeWarnings: boolean): vscode.CodeAction {
        const action = new vscode.CodeAction('Amazon Q: Fix All Issues', vscode.CodeActionKind.QuickFix)

        action.command = {
            command: 'amazonq.02.fixAllWithQ',
            title: 'Amazon Q: Fix All Issues',
            arguments: [includeWarnings],
        }

        return action
    }

    private createExplainProblemAction(
        document: vscode.TextDocument,
        range: vscode.Range,
        diagnostics: vscode.Diagnostic[]
    ): vscode.CodeAction {
        const action = new vscode.CodeAction('Amazon Q: Explain Problem', vscode.CodeActionKind.QuickFix)

        action.command = {
            command: 'amazonq.03.explainProblem',
            title: 'Amazon Q: Explain Problem',
            arguments: [range, diagnostics],
        }

        action.diagnostics = diagnostics

        return action
    }

    public dispose(): void {
        vscode.Disposable.from(...this.disposables).dispose()
    }
}
