/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import { AutoDebugFeature } from './index.js'
import { AutoDebugConfig } from './autoDebugController'

/**
 * Activates the Amazon Q Auto Debug feature.
 * This function should be called from the main extension activation.
 */
export async function activateAutoDebug(
    context: vscode.ExtensionContext,
    config?: Partial<AutoDebugConfig>,
    client?: any,
    encryptionKey?: Buffer
): Promise<AutoDebugFeature> {
    const logger = getLogger('amazonqLsp')
    try {
        // Create and activate the auto debug feature
        const autoDebugFeature = new AutoDebugFeature()
        await autoDebugFeature.activate(context, config, client, encryptionKey)
        // Add to extension subscriptions for proper cleanup
        context.subscriptions.push(autoDebugFeature)
        logger.debug('activateAutoDebug: Amazon Q Auto Debug feature activated successfully')
        return autoDebugFeature
    } catch (error) {
        logger.error('activateAutoDebug: Failed to activate Amazon Q Auto Debug feature: %s', error)
        throw error
    }
}

/**
 * Gets the default configuration for Auto Debug based on workspace settings.
 */
export function getDefaultAutoDebugConfig(): Partial<AutoDebugConfig> {
    const config = vscode.workspace.getConfiguration('amazonq.autoDebug')

    return {
        enabled: config.get<boolean>('enabled', true),
        autoReportThreshold: config.get<number>('autoReportThreshold', 1),
        includedSources: config.get<string[]>('includedSources', []),
        excludedSources: config.get<string[]>('excludedSources', ['spell-checker']),
        severityFilter: config.get<('error' | 'warning' | 'info' | 'hint')[]>('severityFilter', ['error', 'warning']),
        debounceMs: config.get<number>('debounceMs', 1000),
    }
}
