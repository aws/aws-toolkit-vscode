/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { join } from 'path'
import * as vscode from 'vscode'
import { ext } from '../shared/extensionGlobals'
import { registerCommand } from '../shared/telemetry/telemetryUtils'
import { visualizeStateMachine } from './commands/visualizeStateMachine'

/**
 * Activate Step Functions related functionality for the extension.
 */
export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    await registerStepFunctionCommands(extensionContext)
}

async function registerStepFunctionCommands(extensionContext: vscode.ExtensionContext): Promise<void> {

    initalizeWebviewPaths(extensionContext)

    extensionContext.subscriptions.push(
        registerCommand({
            command: 'aws.renderStateMachine',
            callback: async () => {
                return await visualizeStateMachine()
            }
        })
    )
}

function initalizeWebviewPaths(context: vscode.ExtensionContext) {
    ext.visualizationResourcePaths.localScriptsPath =
        vscode.Uri.file(
            join(
                context.extensionPath,
                vscode.workspace.asRelativePath(join('media', 'js'))
            )
        )

    ext.visualizationResourcePaths.webviewScript =
        vscode.Uri.file(
            join(
                context.extensionPath,
                vscode.workspace.asRelativePath(join('media', 'js', 'graphStateMachine.js'))
            )
        )
}
