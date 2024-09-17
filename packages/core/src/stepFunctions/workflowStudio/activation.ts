/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { WorkflowStudioEditorProvider } from './workflowStudioEditorProvider'

/**
 * Activates the extension and registers all necessary components.
 * @param extensionContext The extension context object.
 */
export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    extensionContext.subscriptions.push(WorkflowStudioEditorProvider.register(extensionContext))
}
