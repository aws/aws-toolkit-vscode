/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Commands, getLogger } from 'aws-core-vscode/shared'
import { focusAmazonQPanel } from 'aws-core-vscode/codewhispererChat'
import { placeholder } from 'aws-core-vscode/shared'
import { AutoDebugController } from './controller'

/**
 * Auto Debug commands for Amazon Q
 * Handles all command registrations and implementations
 */
export class AutoDebugCommands implements vscode.Disposable {
    private readonly logger = getLogger()
    private readonly disposables: vscode.Disposable[] = []

    constructor(private readonly controller: AutoDebugController) {
        this.logger.debug('AutoDebugCommands: Initializing auto debug commands')
    }

    /**
     * Register all auto debug commands
     */
    registerCommands(context: vscode.ExtensionContext): void {
        this.logger.debug('AutoDebugCommands: Registering auto debug commands')

        this.disposables.push(
            // Fix with Amazon Q command
            Commands.register(
                {
                    id: 'amazonq.01.fixWithQ',
                    name: 'Amazon Q: Fix Problem',
                    telemetryName: 'amazonq_openChat',
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
                    telemetryName: 'amazonq_openChat',
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
                    telemetryName: 'amazonq_openChat',
                },
                async (range?: vscode.Range, diagnostics?: vscode.Diagnostic[]) => {
                    await this.explainProblem(range, diagnostics)
                }
            ),

            // Detect Problems command
            Commands.register('amazonq.autoDebug.detectProblems', async () => {
                await this.detectProblems()
            })
        )

        // Add all disposables to context
        context.subscriptions.push(...this.disposables)

        this.logger.debug('AutoDebugCommands: All auto debug commands registered successfully')
    }

    /**
     * Fix with Amazon Q - fixes only the specific issues the user selected
     */
    private async fixWithAmazonQ(range?: vscode.Range, diagnostics?: vscode.Diagnostic[]): Promise<void> {
        try {
            this.logger.debug('AutoDebugCommands: Fix with Amazon Q triggered')

            const editor = vscode.window.activeTextEditor
            if (!editor) {
                this.logger.warn('AutoDebugCommands: No active editor for fixWithAmazonQ')
                void vscode.window.showWarningMessage('No active editor found')
                return
            }

            // Focus Amazon Q panel first
            await focusAmazonQPanel.execute(placeholder, 'autoDebug')

            // Use the controller to handle the fix
            await this.controller.fixSpecificProblems(range, diagnostics)
        } catch (error) {
            this.logger.error('AutoDebugCommands: Error in Fix with Amazon Q: %s', error)
            void vscode.window.showErrorMessage('Failed to fix problems with Amazon Q')
        }
    }

    /**
     * Fix All with Amazon Q - processes all errors in the current file
     */
    private async fixAllWithAmazonQ(): Promise<void> {
        try {
            this.logger.debug('AutoDebugCommands: Fix All with Amazon Q triggered')

            const editor = vscode.window.activeTextEditor
            if (!editor) {
                void vscode.window.showWarningMessage('No active editor found')
                return
            }

            // Focus Amazon Q panel first
            await focusAmazonQPanel.execute(placeholder, 'autoDebug')

            // Use the enhanced fix-all-problems method
            await this.controller.fixAllProblemsInFile(10) // 10 errors per batch
        } catch (error) {
            this.logger.error('AutoDebugCommands: Error in Fix All with Amazon Q: %s', error)
            void vscode.window.showErrorMessage('Failed to fix all problems with Amazon Q')
        }
    }

    /**
     * Explains the problem using Amazon Q
     */
    private async explainProblem(range?: vscode.Range, diagnostics?: vscode.Diagnostic[]): Promise<void> {
        try {
            this.logger.debug('AutoDebugCommands: Explain Problem triggered')

            const editor = vscode.window.activeTextEditor
            if (!editor) {
                this.logger.warn('AutoDebugCommands: No active editor for explainProblem')
                return
            }

            // Focus Amazon Q panel first
            await focusAmazonQPanel.execute(placeholder, 'autoDebug')

            // Use the controller to handle the explanation
            await this.controller.explainProblems(range, diagnostics)
        } catch (error) {
            this.logger.error('AutoDebugCommands: Error explaining problem: %s', error)
            void vscode.window.showErrorMessage('Failed to explain problem with Amazon Q')
        }
    }

    /**
     * Manually triggers problem detection
     */
    private async detectProblems(): Promise<void> {
        try {
            this.logger.debug('AutoDebugCommands: Manual problem detection triggered')

            const editor = vscode.window.activeTextEditor
            if (!editor) {
                void vscode.window.showWarningMessage('No active editor found')
                return
            }

            // Use the controller to detect problems
            await this.controller.detectProblems()
        } catch (error) {
            this.logger.error('AutoDebugCommands: Error detecting problems: %s', error)
            void vscode.window.showErrorMessage('Failed to detect problems')
        }
    }

    /**
     * Dispose of all resources
     */
    dispose(): void {
        this.logger.debug('AutoDebugCommands: Disposing auto debug commands')
        vscode.Disposable.from(...this.disposables).dispose()
    }
}
