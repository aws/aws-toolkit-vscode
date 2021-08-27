/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { SamVisualizationManager } from './samVisualizationManager'

export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    const visualizationManger = new SamVisualizationManager(extensionContext)
    extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.samVisualize.renderTemplate', async () => {
            return visualizationManger.renderSamVisualization(vscode.window.activeTextEditor)
        })
    )
}
