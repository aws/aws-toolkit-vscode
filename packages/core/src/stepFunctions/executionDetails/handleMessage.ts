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
} from '../messageHandlers/types'
import {
    loadStageMessageHandler,
    handleUnsupportedMessage,
    apiCallMessageHandler,
} from '../messageHandlers/handleMessageHelpers'

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
