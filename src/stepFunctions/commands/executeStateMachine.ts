/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import _ = require('lodash')
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { StepFunctionsClient } from '../../shared/clients/stepFunctionsClient'
import { ext } from '../../shared/extensionGlobals'
import { ExtensionUtilities } from '../../shared/extensionUtilities'
import { getLogger, Logger } from '../../shared/logger'
import {
    recordStepfunctionsExecuteStateMachine,
    recordStepfunctionsExecuteStateMachineView,
    Result,
} from '../../shared/telemetry/telemetry'
import { BaseTemplates } from '../../shared/templates/baseTemplates'
import { StateMachineNode } from '../explorer/stepFunctionsNodes'
import { StepFunctionsTemplates } from '../templates/stepFunctionsTemplates'

interface CommandMessage {
    command: string
    value?: string
}

export async function executeStateMachine(params: {
    outputChannel: vscode.OutputChannel
    stateMachineNode: StateMachineNode
}) {
    const logger: Logger = getLogger()
    const stateMachineNode = params.stateMachineNode
    recordStepfunctionsExecuteStateMachineView()

    try {
        const view = vscode.window.createWebviewPanel('html', 'Start Execution', vscode.ViewColumn.One, {
            // Enable scripts in the webview
            enableScripts: true,
        })

        const baseTemplateFn = _.template(BaseTemplates.SIMPLE_HTML)
        const executeTemplate = _.template(StepFunctionsTemplates.EXECUTE_TEMPLATE)
        const loadScripts = ExtensionUtilities.getScriptsForHtml(['executeStateMachine.js'])
        const loadLibs = ExtensionUtilities.getLibrariesForHtml(['vue.min.js'])
        const loadStylesheets = ExtensionUtilities.getCssForHtml(['executeStateMachine.css'])

        view.webview.html = baseTemplateFn({
            content: executeTemplate({
                StateMachineName: stateMachineNode.details.name,
                Scripts: loadScripts,
                Libraries: loadLibs,
                Stylesheets: loadStylesheets,
            }),
        })

        view.webview.onDidReceiveMessage(
            createMessageReceivedFunc({
                stateMachine: stateMachineNode,
                outputChannel: params.outputChannel,
                onPostMessage: message => view.webview.postMessage(message),
            }),
            undefined,
            ext.context.subscriptions
        )
    } catch (err) {
        logger.error(err as Error)
    }
}

function createMessageReceivedFunc({
    stateMachine: stateMachine,
    outputChannel,
}: {
    stateMachine: StateMachineNode
    outputChannel: vscode.OutputChannel
    onPostMessage(message: any): Thenable<boolean>
}) {
    const logger: Logger = getLogger()

    return async (message: CommandMessage) => {
        switch (message.command) {
            case 'executeStateMachine':
                let executeResult: Result = 'Succeeded'
                logger.info('Starting Step Functions State Machine execution')

                outputChannel.show()
                outputChannel.appendLine(
                    localize(
                        'AWS.message.info.stepFunctions.executeStateMachine.executing',
                        'Executing {0} in {1}...',
                        stateMachine.details.name,
                        stateMachine.regionCode
                    )
                )
                outputChannel.appendLine('')

                try {
                    if (!stateMachine.details.stateMachineArn) {
                        throw new Error(`Could not determine ARN for state machine ${stateMachine.details.name}`)
                    }
                    const client: StepFunctionsClient = ext.toolkitClientBuilder.createStepFunctionsClient(
                        stateMachine.regionCode
                    )
                    const startExecResponse = await client.executeStateMachine(
                        stateMachine.details.stateMachineArn,
                        message.value || undefined
                    )
                    logger.info('Successfully started execution for Step Functions State Machine')
                    outputChannel.appendLine(
                        localize('AWS.message.info.stepFunctions.executeStateMachine.started', 'Execution started')
                    )
                    outputChannel.appendLine(startExecResponse.executionArn)
                } catch (e) {
                    executeResult = 'Failed'
                    const error = e as Error
                    logger.error('Error starting execution for Step Functions State Machine: %O', error)
                    outputChannel.appendLine(
                        localize(
                            'AWS.message.error.stepFunctions.executeStateMachine.failed_to_start',
                            'There was an error starting execution for {0}, check logs for more information.',
                            stateMachine.details.stateMachineArn
                        )
                    )
                    outputChannel.appendLine('')
                } finally {
                    recordStepfunctionsExecuteStateMachine({ result: executeResult })
                }

                return
        }
    }
}
