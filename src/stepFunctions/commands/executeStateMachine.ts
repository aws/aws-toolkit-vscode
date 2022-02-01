/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { StepFunctionsClient } from '../../shared/clients/stepFunctionsClient'

import { getLogger } from '../../shared/logger'
import {
    recordStepfunctionsExecuteStateMachine,
    recordStepfunctionsExecuteStateMachineView,
    Result,
} from '../../shared/telemetry/telemetry'
import { StateMachineNode } from '../explorer/stepFunctionsNodes'
import globals from '../../shared/extensionGlobals'
import { compileVueWebview } from '../../webviews/main'
import { ExtContext } from '../../shared/extensions'
import { WebviewServer } from '../../webviews/server'

interface CommandMessage {
    command: string
    value?: string
}

interface InitialData {
    arn: string
    name: string
    region: string
}

interface ExecuteStateMachineMessage extends CommandMessage, InitialData {}

function isExecuteStateMachineMessage(m: CommandMessage): m is ExecuteStateMachineMessage {
    return m.command === 'executeStateMachine'
}

const VueWebview = compileVueWebview({
    id: 'remoteInvoke',
    title: localize('AWS.executeStateMachine.title', 'Start Execution'),
    webviewJs: 'stepFunctionsExecuteStateMachineVue.js',
    cssFiles: ['executeStateMachine.css'],
    commands: {
        handler: function (message: CommandMessage | ExecuteStateMachineMessage) {
            handleMessage(this, message)
        },
    },
    start: (init: InitialData) => init,
})
export class ExecuteStateMachineWebview extends VueWebview {}

export async function executeStateMachine(context: ExtContext, node: StateMachineNode): Promise<void> {
    recordStepfunctionsExecuteStateMachineView()
    const wv = new ExecuteStateMachineWebview(context)
    await wv.start({
        arn: node.details.stateMachineArn,
        name: node.details.name,
        region: node.regionCode,
    })
}

async function handleMessage(server: WebviewServer, message: CommandMessage): Promise<void> {
    const logger = getLogger()
    if (isExecuteStateMachineMessage(message)) {
        let executeResult: Result = 'Succeeded'
        logger.info('Starting Step Functions State Machine execution')

        server.context.outputChannel.show()
        server.context.outputChannel.appendLine(
            localize(
                'AWS.message.info.stepFunctions.executeStateMachine.executing',
                'Executing {0} in {1}...',
                message.name,
                message.region
            )
        )
        server.context.outputChannel.appendLine('')

        try {
            if (!message.arn) {
                throw new Error(`Could not determine ARN for state machine ${message.name}`)
            }
            const client: StepFunctionsClient = globals.toolkitClientBuilder.createStepFunctionsClient(message.region)
            const startExecResponse = await client.executeStateMachine(message.arn, message.value || undefined)
            logger.info('Successfully started execution for Step Functions State Machine')
            server.context.outputChannel.appendLine(
                localize('AWS.message.info.stepFunctions.executeStateMachine.started', 'Execution started')
            )
            server.context.outputChannel.appendLine(startExecResponse.executionArn)
        } catch (e) {
            executeResult = 'Failed'
            const error = e as Error
            logger.error('Error starting execution for Step Functions State Machine: %O', error)
            server.context.outputChannel.appendLine(
                localize(
                    'AWS.message.error.stepFunctions.executeStateMachine.failed_to_start',
                    'There was an error starting execution for {0}, check logs for more information.',
                    message.arn
                )
            )
            server.context.outputChannel.appendLine('')
        } finally {
            recordStepfunctionsExecuteStateMachine({ result: executeResult })
        }
    } else {
        throw new Error('Invalid command')
    }
}
