/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { ApplicationComposerManager } from './webviewManager'
import { ApplicationComposerCodeLensProvider } from './codeLensProvider'
import { openTemplateInComposerCommand } from './commands/openTemplateInComposer'
import { openInComposerDialogCommand } from './commands/openInComposerDialog'
import { getLogger } from '../shared/logger/logger'
import { showViewLogsMessage } from '../shared/utilities/messages'

const localize = nls.loadMessageBundle()

export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    let visualizationManager: ApplicationComposerManager
    try {
        visualizationManager = await ApplicationComposerManager.create(extensionContext)
    } catch (err) {
        // The webview HTML could not be fetched, skip infrastrucuture composer activation
        void showViewLogsMessage(
            localize(
                "AWS.ApplicationComposer.visualization.errors.rendering",
                "There was an error rendering Infrastructure Composer, check logs for details"
            ), 'error'
        )
        getLogger().error('Failed to initalise Infrastructure Composer: skipping initialization : ${err}')
        return
    }

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
