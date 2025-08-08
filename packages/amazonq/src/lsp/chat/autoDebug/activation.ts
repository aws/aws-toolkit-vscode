/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from 'aws-core-vscode/shared'
import { AutoDebugCommands } from './commands'
import { AutoDebugCodeActionsProvider } from './codeActionsProvider'
import { AutoDebugController } from './controller'

/**
 * Auto Debug feature activation for Amazon Q
 * This handles the complete lifecycle of the auto debug feature
 */
export class AutoDebugFeature implements vscode.Disposable {
    private readonly logger = getLogger()
    private readonly disposables: vscode.Disposable[] = []

    private autoDebugCommands?: AutoDebugCommands
    private codeActionsProvider?: AutoDebugCodeActionsProvider
    private controller?: AutoDebugController

    constructor(private readonly context: vscode.ExtensionContext) {}

    /**
     * Activate the auto debug feature
     */
    async activate(): Promise<void> {
        try {
            // Initialize the controller first
            this.controller = new AutoDebugController()

            // Initialize commands and register them with the controller
            this.autoDebugCommands = new AutoDebugCommands()
            this.autoDebugCommands.registerCommands(this.context, this.controller)

            // Initialize code actions provider
            this.codeActionsProvider = new AutoDebugCodeActionsProvider()
            this.context.subscriptions.push(this.codeActionsProvider)

            // Add all to disposables
            this.disposables.push(this.controller, this.autoDebugCommands, this.codeActionsProvider)
        } catch (error) {
            this.logger.error('AutoDebugFeature: Failed to activate auto debug feature: %s', error)
            throw error
        }
    }

    /**
     * Get the auto debug controller instance
     */
    getController(): AutoDebugController | undefined {
        return this.controller
    }

    /**
     * Dispose of all resources
     */
    dispose(): void {
        vscode.Disposable.from(...this.disposables).dispose()
    }
}

/**
 * Factory function to activate auto debug feature with LSP client
 * This is the main entry point for activating auto debug
 */
export async function activateAutoDebug(
    context: vscode.ExtensionContext,
    client?: any,
    encryptionKey?: Buffer
): Promise<AutoDebugFeature> {
    const feature = new AutoDebugFeature(context)
    await feature.activate()

    return feature
}
