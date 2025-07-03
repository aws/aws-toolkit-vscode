/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { activate as activateConnectionMagicsSelector } from './connectionMagicsSelector/activation'
import { activate as activateNotebookScheduling } from './notebookScheduling/activation'
import { activate as activateExplorer } from './explorer/activation'

export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    await activateConnectionMagicsSelector(extensionContext)

    await activateNotebookScheduling(extensionContext)

    await activateExplorer(extensionContext)
}
