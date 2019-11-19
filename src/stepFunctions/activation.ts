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
                return await visualizeStateMachine(extensionContext.globalState)
            }
        })
    )
}

function initalizeWebviewPaths(context: vscode.ExtensionContext) {

    // Location for script in body of webview that handles input from user
    // and calls the code to render state machine graph
    ext.visualizationResourcePaths.localScriptsPath =
        vscode.Uri.file(context.asAbsolutePath(join('media', 'js')))

    ext.visualizationResourcePaths.webviewScript =
        vscode.Uri.file(context.asAbsolutePath(join('media', 'js', 'graphStateMachine.js')))

    // Locations for script and css that render the state machine
    const visualizationCache = join(context.globalStoragePath, 'visualization')

    ext.visualizationResourcePaths.visualizationCache =
        vscode.Uri.file(visualizationCache)

    ext.visualizationResourcePaths.visualizationScript =
        vscode.Uri.file(join(visualizationCache, 'graph.js'))

    ext.visualizationResourcePaths.visualizationCSS =
        vscode.Uri.file(join(visualizationCache,'graph.css'))

    // Locations for an additional stylesheet to add Light/Dark/High-Contrast theme support
    ext.visualizationResourcePaths.stateMachineThemePath =
        vscode.Uri.file(context.asAbsolutePath(join('media', 'css')))

    ext.visualizationResourcePaths.stateMachineThemeCSS =
        vscode.Uri.file(context.asAbsolutePath(join('media', 'css', 'stateMachineRender.css')))
}
