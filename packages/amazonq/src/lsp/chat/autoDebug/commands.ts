/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Commands, getLogger, messages } from 'aws-core-vscode/shared'
import { AutoDebugController } from './controller'

/**
 * Auto Debug commands for Amazon Q
 * Handles all command registrations and implementations
 */
export class AutoDebugCommands implements vscode.Disposable {
    private readonly logger = getLogger()
    private readonly disposables: vscode.Disposable[] = []
    private controller!: AutoDebugController

    /**
     * Register all auto debug commands
     */
    registerCommands(context: vscode.ExtensionContext, controller: AutoDebugController): void {
        this.controller = controller
        this.disposables.push(
            // Fix with Amazon Q command
            Commands.register(
                {
                    id: 'amazonq.01.fixWithQ',
                    name: 'Amazon Q: Fix Problem',
                },
                async (range?: vscode.Range, diagnostics?: vscode.Diagnostic[]) => {
                    await this.fixWithAmazonQ(range, diagnostics)
                }
            ),

            // Fix All with Amazon Q command
            Commands.register(
                {
                    id: 'amazonq.02.fixAllWithQ',
                    name: 'Amazon Q: Fix All Errors',
                },
                async () => {
                    await this.fixAllWithAmazonQ()
                }
            ),

            // Explain Problem with Amazon Q command
            Commands.register(
                {
                    id: 'amazonq.03.explainProblem',
                    name: 'Amazon Q: Explain Problem',
                },
                async (range?: vscode.Range, diagnostics?: vscode.Diagnostic[]) => {
                    await this.explainProblem(range, diagnostics)
                }
            )
        )

        // Add all disposables to context
        context.subscriptions.push(...this.disposables)
    }

    /**
     * Generic error handling wrapper for command execution
     */
    private async executeWithErrorHandling<T>(
        action: () => Promise<T>,
        errorMessage: string,
        logContext: string
    ): Promise<T | void> {
        try {
            return await action()
        } catch (error) {
            this.logger.error(`AutoDebugCommands: Error in ${logContext}: %s`, error)
            void messages.showMessage('error', 'Amazon Q was not able to fix or explain the problem. Try again shortly')
        }
    }

    /**
     * Check if there's an active editor and log warning if not
     */
    private checkActiveEditor(): vscode.TextEditor | undefined {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            this.logger.warn('AutoDebugCommands: No active editor found')
        }
        return editor
    }

    /**
     * Fix with Amazon Q - fixes only the specific issues the user selected
     */
    private async fixWithAmazonQ(range?: vscode.Range, diagnostics?: vscode.Diagnostic[]): Promise<void> {
        await this.executeWithErrorHandling(
            async () => {
                const editor = this.checkActiveEditor()
                if (!editor) {
                    return
                }
                const saved = await editor.document.save()
                if (!saved) {
                    throw new Error('Failed to save document')
                }
                await this.controller.fixSpecificProblems(range, diagnostics)
            },
            'Fix with Amazon Q',
            'fixWithAmazonQ'
        )
    }

    /**
     * Fix All with Amazon Q - processes all errors in the current file
     */
    private async fixAllWithAmazonQ(): Promise<void> {
        await this.executeWithErrorHandling(
            async () => {
                const editor = this.checkActiveEditor()
                if (!editor) {
                    return
                }
                const saved = await editor.document.save()
                if (!saved) {
                    throw new Error('Failed to save document')
                }
                await this.controller.fixAllProblemsInFile(10) // 10 errors per batch
            },
            'Fix All with Amazon Q',
            'fixAllWithAmazonQ'
        )
    }

    /**
     * Explains the problem using Amazon Q
     */
    private async explainProblem(range?: vscode.Range, diagnostics?: vscode.Diagnostic[]): Promise<void> {
        await this.executeWithErrorHandling(
            async () => {
                const editor = this.checkActiveEditor()
                if (!editor) {
                    return
                }
                await this.controller.explainProblems(range, diagnostics)
            },
            'Explain Problem',
            'explainProblem'
        )
    }

    /**
     * Dispose of all resources
     */
    dispose(): void {
        vscode.Disposable.from(...this.disposables).dispose()
    }
}
