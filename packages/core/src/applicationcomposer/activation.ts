/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ApplicationComposerManager } from './webviewManager'
import { ApplicationComposerCodeLensProvider } from './codeLensProvider'
import { openTemplateInComposerCommand } from './commands/openTemplateInComposer'
import { openInComposerDialogCommand } from './commands/openInComposerDialog'

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
}
