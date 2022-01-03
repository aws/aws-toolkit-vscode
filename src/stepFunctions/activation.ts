/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { join } from 'path'
import * as vscode from 'vscode'
import { AwsContext } from '../shared/awsContext'
import * as telemetry from '../shared/telemetry/telemetry'
import { activate as activateASL } from './asl/client'
import { createStateMachineFromTemplate } from './commands/createStateMachineFromTemplate'
import { publishStateMachine } from './commands/publishStateMachine'
import { AslVisualizationManager } from './commands/visualizeStateMachine/aslVisualizationManager'

import { ASL_FORMATS, YAML_ASL, JSON_ASL } from './constants/aslFormats'

import * as nls from 'vscode-nls'
import globals from '../shared/extensionGlobals'
const localize = nls.loadMessageBundle()

/**
 * Activate Step Functions related functionality for the extension.
 */
export async function activate(
    extensionContext: vscode.ExtensionContext,
    awsContext: AwsContext,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    globals.visualizationResourcePaths = initalizeWebviewPaths(extensionContext)

    setImmediate(() => activateASL(extensionContext))
    await registerStepFunctionCommands(extensionContext, awsContext, outputChannel)
    initializeCodeLens(extensionContext)
}

async function registerStepFunctionCommands(
    extensionContext: vscode.ExtensionContext,
    awsContext: AwsContext,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    const visualizationManager = new AslVisualizationManager(extensionContext)

    extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.previewStateMachine', async (textEditor?: vscode.TextEditor) => {
            try {
                return await visualizationManager.visualizeStateMachine(
                    extensionContext.globalState,
                    textEditor || vscode.window.activeTextEditor
                )
            } finally {
                // TODO: Consider making the metric reflect the success/failure of the above call
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
        vscode.commands.registerCommand('aws.stepfunctions.publishStateMachine', async (node?: any) => {
            const region: string | undefined = node?.regionCode
            await publishStateMachine(awsContext, outputChannel, region)
        })
    )
}

export function initalizeWebviewPaths(context: vscode.ExtensionContext): typeof globals['visualizationResourcePaths'] {
    // Location for script in body of webview that handles input from user
    // and calls the code to render state machine graph

    // Locations for script and css that render the state machine
    const visualizationLibraryCache = join(context.globalStoragePath, 'visualization')

    return {
        localWebviewScriptsPath: vscode.Uri.file(context.asAbsolutePath(join('media', 'js'))),
        webviewBodyScript: vscode.Uri.file(context.asAbsolutePath(join('media', 'js', 'graphStateMachine.js'))),
        visualizationLibraryCachePath: vscode.Uri.file(visualizationLibraryCache),
        visualizationLibraryScript: vscode.Uri.file(join(visualizationLibraryCache, 'graph.js')),
        visualizationLibraryCSS: vscode.Uri.file(join(visualizationLibraryCache, 'graph.css')),
        // Locations for an additional stylesheet to add Light/Dark/High-Contrast theme support
        stateMachineCustomThemePath: vscode.Uri.file(context.asAbsolutePath(join('media', 'css'))),
        stateMachineCustomThemeCSS: vscode.Uri.file(
            context.asAbsolutePath(join('media', 'css', 'stateMachineRender.css'))
        ),
    }
}

function initializeCodeLens(context: vscode.ExtensionContext) {
    class StepFunctionsCodeLensProvider implements vscode.CodeLensProvider {
        public async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
            const topOfDocument = new vscode.Range(0, 0, 0, 0)

            const renderCommand: vscode.Command = {
                command: 'aws.previewStateMachine',
                title: localize('AWS.stepFunctions.render', 'Render graph'),
            }
            const renderCodeLens = new vscode.CodeLens(topOfDocument, renderCommand)

            if (ASL_FORMATS.includes(document.languageId)) {
                const publishCommand: vscode.Command = {
                    command: 'aws.stepfunctions.publishStateMachine',
                    title: localize('AWS.stepFunctions.publish', 'Publish to Step Functions'),
                }
                const publishCodeLens = new vscode.CodeLens(topOfDocument, publishCommand)

                return [publishCodeLens, renderCodeLens]
            } else {
                return [renderCodeLens]
            }
        }
    }

    const docSelector = [{ language: JSON_ASL }, { language: YAML_ASL }]

    const codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(
        docSelector,
        new StepFunctionsCodeLensProvider()
    )

    context.subscriptions.push(codeLensProviderDisposable)
}
