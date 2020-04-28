/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { join } from 'path'
import * as vscode from 'vscode'
import { AwsContext } from '../shared/awsContext'
import { ext } from '../shared/extensionGlobals'
import * as telemetry from '../shared/telemetry/telemetry'
import { activate as activateASL } from './asl/client'
import { createStateMachineFromTemplate } from './commands/createStateMachineFromTemplate'
import { publishStateMachine } from './commands/publishStateMachine'
import { AslVisualizationManager } from './commands/visualizeStateMachine/aslVisualizationManager'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

/**
 * Activate Step Functions related functionality for the extension.
 */
export async function activate(
    extensionContext: vscode.ExtensionContext,
    awsContext: AwsContext,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    await activateASL(extensionContext)
    await registerStepFunctionCommands(extensionContext, awsContext, outputChannel)
    initializeCodeLens(extensionContext)
}

async function registerStepFunctionCommands(
    extensionContext: vscode.ExtensionContext,
    awsContext: AwsContext,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    initalizeWebviewPaths(extensionContext)
    const visualizationManager = new AslVisualizationManager(extensionContext)

    extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.previewStateMachine', async () => {
            try {
                return await visualizationManager.visualizeStateMachine(extensionContext.globalState)
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

    extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.stepfunctions.publishStateMachine', async () => {
            await publishStateMachine(awsContext, outputChannel)
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

function initializeCodeLens(context: vscode.ExtensionContext) {
    class StepFunctionsCodeLensProvider implements vscode.CodeLensProvider {
        public async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
            const topOfDocument = new vscode.Range(0, 0, 0, 0)

            const renderCommand: vscode.Command = {
                command: 'aws.previewStateMachine',
                title: localize('AWS.stepFunctions.render', 'Render graph'),
            }

            const publishCommand: vscode.Command = {
                command: 'aws.stepfunctions.publishStateMachine',
                title: localize('AWS.stepFunctions.publish', 'Publish to Step Functions'),
            }

            const renderCodeLens = new vscode.CodeLens(topOfDocument, renderCommand)
            const publishCodeLens = new vscode.CodeLens(topOfDocument, publishCommand)

            return [publishCodeLens, renderCodeLens]
        }
    }

    const docSelector = {
        language: 'asl',
    }

    const codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(
        docSelector,
        new StepFunctionsCodeLensProvider()
    )

    context.subscriptions.push(codeLensProviderDisposable)
}
