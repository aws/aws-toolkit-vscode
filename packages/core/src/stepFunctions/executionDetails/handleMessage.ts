/*
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Command,
    Message,
    MessageType,
    ExecutionDetailsContext,
    ApiCallRequestMessage,
    InitResponseMessage,
    StartExecutionMessage,
} from '../messageHandlers/types'
import {
    loadStageMessageHandler,
    handleUnsupportedMessage,
    apiCallMessageHandler,
} from '../messageHandlers/handleMessageHelpers'
import { parseExecutionArnForStateMachine } from '../utils'
import { getLogger } from '../../shared/logger/logger'
import { openWorkflowStudio } from '../stepFunctionsWorkflowStudioUtils'
import { showExecuteStateMachineWebview } from '../vue/executeStateMachine/executeStateMachine'

/**
 * Handles messages received from the ExecutionDetails webview. Depending on the message type and command,
 * calls the appropriate handler function
 * @param message The message received from the webview
 * @param context The context object containing information about the execution details webview environment
 */
export async function handleMessage(message: Message, context: ExecutionDetailsContext) {
    const { command, messageType } = message
    if (messageType === MessageType.REQUEST) {
        switch (command) {
            case Command.INIT:
                void initMessageHandler(context)
                break
            case Command.API_CALL: {
                const region = parseExecutionArnForStateMachine(context.executionArn)?.region || 'us-east-1'
                void apiCallMessageHandler(message as ApiCallRequestMessage, context, region)
                break
            }
            case Command.START_EXECUTION:
                void startExecutionMessageHandler(message as StartExecutionMessage, context)
                break
            case Command.EDIT_STATE_MACHINE:
                void editStateMachineMessageHandler(context)
                break
            default:
                void handleUnsupportedMessage(context, message)
                break
        }
    } else if (messageType === MessageType.BROADCAST) {
        switch (command) {
            case Command.LOAD_STAGE:
                void loadStageMessageHandler(context)
                break
            default:
                void handleUnsupportedMessage(context, message)
                break
        }
    } else {
        void handleUnsupportedMessage(context, message)
    }
}

/**
 * Handler for when the webview is ready.
 * This handler is used to initialize the webview with execution details.
 * @param context The context object containing the necessary information for the webview.
 */
async function initMessageHandler(context: ExecutionDetailsContext) {
    try {
        await context.panel.webview.postMessage({
            messageType: MessageType.BROADCAST,
            command: Command.INIT,
            executionArn: context.executionArn,
            startTime: context.startTime,
        })
    } catch (e) {
        await context.panel.webview.postMessage({
            messageType: MessageType.RESPONSE,
            command: Command.INIT,
            isSuccess: false,
            failureReason: (e as Error).message,
        } as InitResponseMessage)
    }
}

async function startExecutionMessageHandler(message: StartExecutionMessage, context: ExecutionDetailsContext) {
    const logger = getLogger('stepfunctions')
    try {
        // Parsing execution ARN to get state machine info
        const parsedArn = parseExecutionArnForStateMachine(context.executionArn)
        if (!parsedArn) {
            throw new Error(`Invalid execution ARN format: ${context.executionArn}`)
        }

        const { region, stateMachineName, stateMachineArn } = parsedArn

        await showExecuteStateMachineWebview({
            arn: stateMachineArn,
            name: stateMachineName,
            region: region,
            openExecutionDetails: context.openExecutionDetails,
            executionInput: message.executionInput,
        })
    } catch (error) {
        logger.error('Start execution failed: %O', error)
    }
}

async function editStateMachineMessageHandler(context: ExecutionDetailsContext) {
    const params = parseExecutionArnForStateMachine(context.executionArn)
    await openWorkflowStudio(params!.stateMachineArn, params!.region)
}
