/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { WorkflowStudioEditorProvider } from './workflowStudioEditorProvider'
import { Commands } from '../../shared/vscode/commands2'
import { globals } from '../../shared'

/**
 * Activates the extension and registers all necessary components.
 */
export async function activate(): Promise<void> {
    globals.context.subscriptions.push(WorkflowStudioEditorProvider.register())

    // Open the file with Workflow Studio editor in a new tab, or focus on the tab with WFS if it is already open
    globals.context.subscriptions.push(
        Commands.register('aws.stepfunctions.openWithWorkflowStudio', async (uri: vscode.Uri) => {
            await vscode.commands.executeCommand('vscode.openWith', uri, WorkflowStudioEditorProvider.viewType)
        })
    )

    // Close the active editor and open the file with Workflow Studio (or close and switch to the existing relevant tab).
    // This command is expected to always be called from the active tab in the default editor mode
    globals.context.subscriptions.push(
        Commands.register('aws.stepfunctions.switchToWorkflowStudio', async (uri: vscode.Uri) => {
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
            await vscode.commands.executeCommand('vscode.openWith', uri, WorkflowStudioEditorProvider.viewType)
        })
    )
}
