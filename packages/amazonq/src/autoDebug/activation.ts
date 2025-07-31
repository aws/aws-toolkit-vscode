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
            this.logger.info('AutoDebugFeature: Activating auto debug feature')

            // Initialize the controller first
            this.controller = new AutoDebugController()
            await this.controller.initialize()

            // Initialize commands and pass the controller
            this.autoDebugCommands = new AutoDebugCommands(this.controller)
            this.autoDebugCommands.registerCommands(this.context)

            // Initialize code actions provider
            this.codeActionsProvider = new AutoDebugCodeActionsProvider()
            this.context.subscriptions.push(this.codeActionsProvider)

            // Add all to disposables
            this.disposables.push(this.controller, this.autoDebugCommands, this.codeActionsProvider)

            this.logger.info('AutoDebugFeature: Auto debug feature activated successfully')
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
        this.logger.debug('AutoDebugFeature: Disposing auto debug feature')
        vscode.Disposable.from(...this.disposables).dispose()
    }
}

/**
 * Factory function to activate auto debug feature
 * This is the main entry point for activating auto debug
 */
export async function activateAutoDebug(context: vscode.ExtensionContext): Promise<AutoDebugFeature> {
    const feature = new AutoDebugFeature(context)
    await feature.activate()
    return feature
}
