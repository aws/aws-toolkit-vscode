/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Commands } from '../vscode/commands2'
import { createStarterTemplateFile, localize } from '../utilities/vsCodeUtils'
import { BuildspecTemplateRegistry } from './registry'
import { getLogger } from '../logger'
import globals from '../extensionGlobals'
import { NoopWatcher } from '../fs/watchedFiles'

export const TEMPLATE_FILE_GLOB_PATTERN = '**/*.{yaml,yml}'

/**
 * Activate Buildspec related functionality for the extension.
 */
export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    try {
        const registry = new BuildspecTemplateRegistry()
        globals.templateRegistry.buildspec = registry
        await registry.addWatchPattern(TEMPLATE_FILE_GLOB_PATTERN)
        await registry.watchUntitledFiles()
    } catch (e) {
        vscode.window.showErrorMessage(
            localize(
                'AWS.buildspec.failToInitialize',
                'Failed to activate buildspec template registry. Language features will not appear on buildspec files.'
            )
        )
        getLogger().error('Failed to activate buildspec template registry', e)
        globals.templateRegistry.buildspec = new NoopWatcher() as unknown as BuildspecTemplateRegistry
    }
    extensionContext.subscriptions.push(
        Commands.register('aws.buildspec.newTemplate', () => {
            return createStarterTemplateFile(buildspecTemplate)
        })
    )
}

const buildspecTemplate = `version: 0.2
phases:
  
`
