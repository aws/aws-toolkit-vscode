/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ThreatComposerEditorProvider } from './editorWebviewManager'
import { CreateNewThreatComposer, NewThreatComposerFile } from './commands/createNewThreatCompoerFile'

export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    extensionContext.subscriptions.push(
        ThreatComposerEditorProvider.register(extensionContext),
        CreateNewThreatComposer.register(),
        NewThreatComposerFile.register()
    )
}
