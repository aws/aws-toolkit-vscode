/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../shared/extensionGlobals'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { join } from 'path'
import * as vscode from 'vscode'
import { AwsContext } from '../shared/awsContext'
import { activate as activateASL } from './asl/client'
import { createStateMachineFromTemplate } from './commands/createStateMachineFromTemplate'
import { publishStateMachine } from './commands/publishStateMachine'
import { AslVisualizationManager } from './commands/visualizeStateMachine/aslVisualizationManager'
import { Commands } from '../shared/vscode/commands2'

import { ASL_FORMATS, YAML_ASL, JSON_ASL } from './constants/aslFormats'
import { AslVisualizationCDKManager } from './commands/visualizeStateMachine/aslVisualizationCDKManager'
import { renderCdkStateMachineGraph } from './commands/visualizeStateMachine/renderStateMachineGraphCDK'
import { ToolkitError } from '../shared/errors'
import { telemetry } from '../shared/telemetry/telemetry'
import { PerfLog } from '../shared/logger/logger'

/**
 * Activate Step Functions related functionality for the extension.
 */
export async function activate(
    extensionContext: vscode.ExtensionContext,
    awsContext: AwsContext,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    globals.visualizationResourcePaths = initalizeWebviewPaths(extensionContext)

    await registerStepFunctionCommands(extensionContext, awsContext, outputChannel)
    initializeCodeLens(extensionContext)

    let onDidOpenAslDoc: vscode.Disposable // eslint-disable-line prefer-const
    // PERFORMANCE: Start the LSP client/server _only_ when the first ASL document is opened.
    // eslint-disable-next-line prefer-const
    onDidOpenAslDoc = vscode.window.onDidChangeActiveTextEditor(async e => {
        if (e?.document && ASL_FORMATS.includes(e.document.languageId)) {
            const perflog = new PerfLog('stepFunctions: start LSP client/server')
            await activateASL(extensionContext)
            perflog.done()
            onDidOpenAslDoc?.dispose() // Handler should only run once.
        }
    }, undefined)
    extensionContext.subscriptions.push(onDidOpenAslDoc)
}

/*
 * TODO: Determine behaviour when command is run against bad input, or
 * non-json files. Determine if we want to limit the command to only a
 * specifc subset of file types ( .json only, custom .states extension, etc...)
 * Ensure tests are written for this use case as well.
 */
export const previewStateMachineCommand = Commands.declare(
    'aws.previewStateMachine',
    (globalState: vscode.Memento, manager: AslVisualizationManager) => async (arg?: vscode.TextEditor | vscode.Uri) => {
        try {
            arg ??= vscode.window.activeTextEditor
            const input = arg instanceof vscode.Uri ? arg : arg?.document

            if (!input) {
                throw new ToolkitError('No active text editor or document found')
            }

            return await manager.visualizeStateMachine(globalState, input)
        } finally {
            // TODO: Consider making the metric reflect the success/failure of the above call
            telemetry.stepfunctions_previewstatemachine.emit()
        }
    }
)

async function registerStepFunctionCommands(
    extensionContext: vscode.ExtensionContext,
    awsContext: AwsContext,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    const visualizationManager = new AslVisualizationManager(extensionContext)
    const cdkVisualizationManager = new AslVisualizationCDKManager(extensionContext)

    extensionContext.subscriptions.push(
        previewStateMachineCommand.register(extensionContext.globalState, visualizationManager),
        renderCdkStateMachineGraph.register(extensionContext.globalState, cdkVisualizationManager),
        Commands.register('aws.stepfunctions.createStateMachineFromTemplate', async () => {
            try {
                await createStateMachineFromTemplate(extensionContext)
            } finally {
                telemetry.stepfunctions_createStateMachineFromTemplate.emit()
            }
        }),
        Commands.register('aws.stepfunctions.publishStateMachine', async (node?: any) => {
            const region: string | undefined = node?.regionCode
            await publishStateMachine(awsContext, outputChannel, region)
        })
    )
}

export function initalizeWebviewPaths(
    context: vscode.ExtensionContext
): (typeof globals)['visualizationResourcePaths'] {
    // Location for script in body of webview that handles input from user
    // and calls the code to render state machine graph

    // Locations for script and css that render the state machine
    const visualizationLibraryCache = join(context.globalStorageUri.fsPath, 'visualization')

    return {
        localWebviewScriptsPath: vscode.Uri.file(context.asAbsolutePath(join('resources', 'js'))),
        webviewBodyScript: vscode.Uri.file(context.asAbsolutePath(join('resources', 'js', 'graphStateMachine.js'))),
        visualizationLibraryCachePath: vscode.Uri.file(visualizationLibraryCache),
        visualizationLibraryScript: vscode.Uri.file(join(visualizationLibraryCache, 'graph.js')),
        visualizationLibraryCSS: vscode.Uri.file(join(visualizationLibraryCache, 'graph.css')),
        // Locations for an additional stylesheet to add Light/Dark/High-Contrast theme support
        stateMachineCustomThemePath: vscode.Uri.file(context.asAbsolutePath(join('resources', 'css'))),
        stateMachineCustomThemeCSS: vscode.Uri.file(
            context.asAbsolutePath(join('resources', 'css', 'stateMachineRender.css'))
        ),
    }
}

function initializeCodeLens(context: vscode.ExtensionContext) {
    class StepFunctionsCodeLensProvider implements vscode.CodeLensProvider {
        public async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
            const topOfDocument = new vscode.Range(0, 0, 0, 0)

            const renderCodeLens = previewStateMachineCommand.build().asCodeLens(topOfDocument, {
                title: localize('AWS.stepFunctions.render', 'Render graph'),
            })

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
