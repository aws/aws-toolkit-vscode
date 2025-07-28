/*
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import {
    Command,
    Message,
    MessageType,
    ExecutionDetailsContext,
    ApiCallRequestMessage,
    InitResponseMessage,
} from '../messageHandlers/types'
import {
    loadStageMessageHandler,
    handleUnsupportedMessage,
    apiCallMessageHandler,
} from '../messageHandlers/handleMessageHelpers'
import { parseExecutionArnForStateMachine, openWFSfromARN } from '../utils'
import { ExecuteStateMachineWebview } from '../vue/executeStateMachine/executeStateMachine'
import { VueWebview } from '../../webviews/main'
import globals from '../../shared/extensionGlobals'
// import { ExecutionDetailProvider } from './executionDetailProvider'
// import { WorkflowStudioEditorProvider } from '../workflowStudio/workflowStudioEditorProvider'

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
            case Command.API_CALL:
                void apiCallMessageHandler(message as ApiCallRequestMessage, context)
                break
            case Command.START_EXECUTION:
                void startExecutionMessageHandler(context)
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

async function startExecutionMessageHandler(context: ExecutionDetailsContext) {
    // Parsing execution ARN to get state machine info
    const { region, stateMachineName, stateMachineArn } = parseExecutionArnForStateMachine(context.executionArn)

    const Panel = VueWebview.compilePanel(ExecuteStateMachineWebview)
    const wv = new Panel(globals.context, globals.outputChannel, {
        arn: stateMachineArn,
        name: stateMachineName,
        region: region,
    })

    await wv.show({
        title: localize('AWS.executeStateMachine.title', 'Start Execution'),
        cssFiles: ['executeStateMachine.css'],
    })
}

async function editStateMachineMessageHandler(context: ExecutionDetailsContext) {
    await openWFSfromARN(context)
}
