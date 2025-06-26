/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../../shared/logger/logger'
import { AutoDebugController } from '../autoDebugController'

/**
 * Provides code actions for Amazon Q Auto Debug features.
 * Integrates with VS Code's quick fix system to offer debugging assistance.
 */
export class AutoDebugCodeActionsProvider implements vscode.CodeActionProvider, vscode.Disposable {
    private readonly logger = getLogger('amazonqLsp')
    private readonly disposables: vscode.Disposable[] = []

    public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix, vscode.CodeActionKind.Refactor]

    constructor(private readonly autoDebugController: AutoDebugController) {
        this.logger.debug('AutoDebugCodeActionsProvider: Initializing code actions provider')
        this.registerProvider()
    }

    private registerProvider(): void {
        this.logger.debug('AutoDebugCodeActionsProvider: Registering code actions provider')

        // Register for all file types that might have diagnostics
        const selector: vscode.DocumentSelector = [
            { scheme: 'file', language: 'typescript' },
            { scheme: 'file', language: 'javascript' },
            { scheme: 'file', language: 'python' },
            { scheme: 'file', language: 'java' },
            { scheme: 'file', language: 'csharp' },
            { scheme: 'file', language: 'cpp' },
            { scheme: 'file', language: 'c' },
            { scheme: 'file', language: 'go' },
            { scheme: 'file', language: 'rust' },
            { scheme: 'file', language: 'php' },
            { scheme: 'file', language: 'ruby' },
            { scheme: 'file', language: 'json' },
            { scheme: 'file', language: 'yaml' },
            { scheme: 'file', language: 'xml' },
        ]

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
        this.logger.debug(
            'AutoDebugCodeActionsProvider: Providing code actions for %s at range %s',
            document.fileName,
            `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`
        )

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

            // Add "Explain Problem" action
            actions.push(this.createExplainProblemAction(document, range, diagnostics))

            // Add "Add to Amazon Q Chat" action
            actions.push(this.createAddToChatAction(document, range, diagnostics))
        }

        // Always add session management actions
        const currentSession = this.autoDebugController.getCurrentSession()
        if (currentSession?.isActive) {
            actions.push(this.createEndSessionAction())
        } else {
            actions.push(this.createStartSessionAction())
        }

        // Add "Detect Problems" action
        actions.push(this.createDetectProblemsAction(document, range))

        this.logger.debug('AutoDebugCodeActionsProvider: Provided %d code actions', actions.length)
        return actions
    }

    private createFixWithQAction(
        document: vscode.TextDocument,
        range: vscode.Range,
        diagnostics: vscode.Diagnostic[]
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(
            `Fix with Amazon Q (${diagnostics.length} issue${diagnostics.length !== 1 ? 's' : ''})`,
            vscode.CodeActionKind.QuickFix
        )

        action.command = {
            command: 'amazonq.autoDebug.fixWithQ',
            title: 'Fix with Amazon Q',
            arguments: [range, diagnostics],
        }

        action.diagnostics = diagnostics
        action.isPreferred = true // Make this the preferred quick fix

        return action
    }

    private createExplainProblemAction(
        document: vscode.TextDocument,
        range: vscode.Range,
        diagnostics: vscode.Diagnostic[]
    ): vscode.CodeAction {
        const action = new vscode.CodeAction('Explain Problem with Amazon Q', vscode.CodeActionKind.QuickFix)

        action.command = {
            command: 'amazonq.autoDebug.explainProblem',
            title: 'Explain Problem with Amazon Q',
            arguments: [range, diagnostics],
        }

        action.diagnostics = diagnostics

        return action
    }

    private createAddToChatAction(
        document: vscode.TextDocument,
        range: vscode.Range,
        diagnostics: vscode.Diagnostic[]
    ): vscode.CodeAction {
        const action = new vscode.CodeAction('Add to Amazon Q Chat', vscode.CodeActionKind.Refactor)

        action.command = {
            command: 'amazonq.autoDebug.addToChat',
            title: 'Add to Amazon Q Chat',
            arguments: [range, diagnostics],
        }

        action.diagnostics = diagnostics

        return action
    }

    private createStartSessionAction(): vscode.CodeAction {
        const action = new vscode.CodeAction('Start Auto Debug Session', vscode.CodeActionKind.Refactor)

        action.command = {
            command: 'amazonq.autoDebug.startSession',
            title: 'Start Auto Debug Session',
        }

        return action
    }

    private createEndSessionAction(): vscode.CodeAction {
        const action = new vscode.CodeAction('End Auto Debug Session', vscode.CodeActionKind.Refactor)

        action.command = {
            command: 'amazonq.autoDebug.endSession',
            title: 'End Auto Debug Session',
        }

        return action
    }

    private createDetectProblemsAction(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction {
        const action = new vscode.CodeAction('Detect Problems with Amazon Q', vscode.CodeActionKind.Refactor)

        action.command = {
            command: 'amazonq.autoDebug.detectProblems',
            title: 'Detect Problems with Amazon Q',
        }

        return action
    }

    public dispose(): void {
        this.logger.debug('AutoDebugCodeActionsProvider: Disposing code actions provider')
        vscode.Disposable.from(...this.disposables).dispose()
    }
}
