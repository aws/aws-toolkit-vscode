/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import path from 'path'
import { ApplicationComposerManager } from './webviewManager'
import { ApplicationComposerCodeLensProvider } from './codeLensProvider'
import { openTemplateInComposerCommand } from './commands/openTemplateInComposer'
import { openInComposerDialogCommand } from './commands/openInComposerDialog'
import globals from '../shared/extensionGlobals'
export const templateToOpenAppComposer = 'aws.toolkit.appComposer.templateToOpenOnStart'

export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    const visualizationManager = new ApplicationComposerManager(extensionContext)

    extensionContext.subscriptions.push(
        openTemplateInComposerCommand.register(visualizationManager),
        openInComposerDialogCommand.register(visualizationManager)
    )

    extensionContext.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            ['yaml', 'json', { scheme: 'file' }],
            new ApplicationComposerCodeLensProvider()
        )
    )

    await openApplicationComposerAfterReload()
}

/**
 * To support open template in AppComposer after extension reload.
 * This typically happens when user create project from walkthrough
 * and added a new folder to an empty workspace.
 *
 * Checkes templateToOpenAppComposer in global and opens template
 * Directly return if templateToOpenAppComposer is undefined
 */
async function openApplicationComposerAfterReload(): Promise<void> {
    const templatesToOpen = globals.globalState.get<[string]>(templateToOpenAppComposer)
    // undefined
    if (!templatesToOpen) {
        return
    }

    for (const template of templatesToOpen) {
        const templateUri = vscode.Uri.file(template)
        const templateFolder = vscode.Uri.file(path.dirname(template))
        const basename = path.basename(template)
        // ignore templates that doesn't belong to current workspace, ignore if not template
        if (
            !vscode.workspace.getWorkspaceFolder(templateFolder) ||
            (basename !== 'template.yaml' && basename !== 'template.yml')
        ) {
            continue
        }

        await vscode.commands.executeCommand('aws.openInApplicationComposer', templateUri)
    }
    // set to undefined
    await globals.globalState.update(templateToOpenAppComposer, undefined)
}
