/*
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Command,
    Message,
    MessageType,
    WebviewContext,
    ApiCallRequestMessage,
    UnsupportedMessage,
    InitResponseMessage,
} from '../workflowStudio/types'

import { WorkflowStudioApiHandler } from '../workflowStudio/workflowStudioApiHandler'
import globals from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger/logger'

// Extended context for execution details
export interface ExecutionDetailsContext extends WebviewContext {
    executionArn?: string
}

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

/**
 * Handler for managing webview stage load, which updates load notifications.
 * @param context The context object containing the necessary information for the webview.
 */
async function loadStageMessageHandler(context: ExecutionDetailsContext) {
    context.loaderNotification?.progress.report({ increment: 25 })
    setTimeout(() => {
        context.loaderNotification?.resolve()
    }, 100)
}

/**
 * Handler for making API calls from the webview and returning the response.
 * @param request The request message containing the API to call and the parameters
 * @param context The webview context used for returning the API response to the webview
 */
function apiCallMessageHandler(request: ApiCallRequestMessage, context: WebviewContext) {
    const logger = getLogger('stepfunctions')
    const apiHandler = new WorkflowStudioApiHandler(globals.awsContext.getCredentialDefaultRegion(), context)
    apiHandler.performApiCall(request).catch((error) => logger.error('%s API call failed: %O', request.apiName, error))
}

/**
 * Handles unsupported or unrecognized messages by sending a response to the webview. Ensures compatibility with future
 * commands and message types, preventing issues if the user has an outdated extension version.
 * @param context The context object containing information about the webview environment
 * @param originalMessage The original message that was not supported
 */
async function handleUnsupportedMessage(context: ExecutionDetailsContext, originalMessage: Message) {
    const logger = getLogger('stepfunctions')

    logger.warn('Received unsupported message: %O', originalMessage)

    await context.panel.webview.postMessage({
        messageType: MessageType.RESPONSE,
        command: Command.UNSUPPORTED_COMMAND,
        originalMessage,
    } as UnsupportedMessage)
}
