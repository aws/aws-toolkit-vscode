/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { join } from 'path'
import * as vscode from 'vscode'
import { ext } from '../shared/extensionGlobals'
import * as telemetry from '../shared/telemetry/telemetry'
import { activate as activateASL } from './asl/client'
import { createStateMachineFromTemplate } from './commands/createStateMachineFromTemplate'
import { visualizeStateMachine } from './commands/visualizeStateMachine'

/**
 * Activate Step Functions related functionality for the extension.
 */
export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    await activateASL(extensionContext)
    await registerStepFunctionCommands(extensionContext)
}

async function registerStepFunctionCommands(extensionContext: vscode.ExtensionContext): Promise<void> {
    initalizeWebviewPaths(extensionContext)

    extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.previewStateMachine', async () => {
            try {
                return await visualizeStateMachine(extensionContext.globalState)
            } finally {
                telemetry.recordStepfunctionsPreviewstatemachine()
            }
        })
    )

    extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.stepfunctions.createStateMachineFromTemplate', async () => {
            try {
                await createStateMachineFromTemplate(extensionContext)
            } finally {
                telemetry.recordStepfunctionsCreateStateMachineFromTemplate()
            }
        })
    )
}

function initalizeWebviewPaths(context: vscode.ExtensionContext) {
    // Location for script in body of webview that handles input from user
    // and calls the code to render state machine graph
    ext.visualizationResourcePaths.localWebviewScriptsPath = vscode.Uri.file(
        context.asAbsolutePath(join('media', 'js'))
    )

    ext.visualizationResourcePaths.webviewBodyScript = vscode.Uri.file(
        context.asAbsolutePath(join('media', 'js', 'graphStateMachine.js'))
    )

    // Locations for script and css that render the state machine
    const visualizationLibraryCache = join(context.globalStoragePath, 'visualization')

    ext.visualizationResourcePaths.visualizationLibraryCachePath = vscode.Uri.file(visualizationLibraryCache)

    ext.visualizationResourcePaths.visualizationLibraryScript = vscode.Uri.file(
        join(visualizationLibraryCache, 'graph.js')
    )

    ext.visualizationResourcePaths.visualizationLibraryCSS = vscode.Uri.file(
        join(visualizationLibraryCache, 'graph.css')
    )

    // Locations for an additional stylesheet to add Light/Dark/High-Contrast theme support
    ext.visualizationResourcePaths.stateMachineCustomThemePath = vscode.Uri.file(
        context.asAbsolutePath(join('media', 'css'))
    )

    ext.visualizationResourcePaths.stateMachineCustomThemeCSS = vscode.Uri.file(
        context.asAbsolutePath(join('media', 'css', 'stateMachineRender.css'))
    )
}
