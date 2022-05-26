/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { StepFunctionsClient } from '../../../shared/clients/stepFunctionsClient'

import { getLogger } from '../../../shared/logger'
import {
    recordStepfunctionsExecuteStateMachine,
    recordStepfunctionsExecuteStateMachineView,
    Result,
} from '../../../shared/telemetry/telemetry'
import { StateMachineNode } from '../../explorer/stepFunctionsNodes'
import globals from '../../../shared/extensionGlobals'
import { ExtContext } from '../../../shared/extensions'
import { VueWebview } from '../../../webviews/main'
import * as vscode from 'vscode'

interface StateMachine {
    arn: string
    name: string
    region: string
}

export class ExecuteStateMachineWebview extends VueWebview {
    public readonly id = 'remoteInvoke'
    public readonly source = 'src/stepFunctions/vue/executeStateMachine/index.js'
    private readonly logger = getLogger()

    public constructor(private readonly channel: vscode.OutputChannel, private readonly stateMachine: StateMachine) {
        super()
    }

    public init() {
        return this.stateMachine
    }

    public async executeStateMachine(input: string) {
        let executeResult: Result = 'Succeeded'
        this.logger.info('Starting Step Functions State Machine execution')

        this.channel.show()
        this.channel.appendLine(
            localize(
                'AWS.message.info.stepFunctions.executeStateMachine.executing',
                'Executing {0} in {1}...',
                this.stateMachine.name,
                this.stateMachine.region
            )
        )
        this.channel.appendLine('')

        try {
            const client: StepFunctionsClient = globals.toolkitClientBuilder.createStepFunctionsClient(
                this.stateMachine.region
            )
            const startExecResponse = await client.executeStateMachine(this.stateMachine.arn, input)
            this.logger.info('Successfully started execution for Step Functions State Machine')
            this.channel.appendLine(
                localize('AWS.message.info.stepFunctions.executeStateMachine.started', 'Execution started')
            )
            this.channel.appendLine(startExecResponse.executionArn)
        } catch (e) {
            executeResult = 'Failed'
            const error = e as Error
            this.logger.error('Error starting execution for Step Functions State Machine: %O', error)
            this.channel.appendLine(
                localize(
                    'AWS.message.error.stepFunctions.executeStateMachine.failed_to_start',
                    'There was an error starting execution for {0}, check logs for more information.',
                    this.stateMachine.arn
                )
            )
            this.channel.appendLine('')
        } finally {
            recordStepfunctionsExecuteStateMachine({ result: executeResult })
        }
    }
}

const Panel = VueWebview.compilePanel(ExecuteStateMachineWebview)

export async function executeStateMachine(context: ExtContext, node: StateMachineNode): Promise<void> {
    const wv = new Panel(context.extensionContext, context.outputChannel, {
        arn: node.details.stateMachineArn,
        name: node.details.name,
        region: node.regionCode,
    })

    await wv.show({
        title: localize('AWS.executeStateMachine.title', 'Start Execution'),
        cssFiles: ['executeStateMachine.css'],
    })
    recordStepfunctionsExecuteStateMachineView()
}
