/*
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command, Message, MessageType, BaseContext, UnsupportedMessage, ApiCallRequestMessage } from './types'
import { getLogger } from '../../shared/logger/logger'
import { StepFunctionApiHandler } from './stepFunctionApiHandler'

/**
 * Handler for managing webview stage load, which updates load notifications.
 * @param context The context object containing the necessary information for the webview.
 */
export async function loadStageMessageHandler(context: BaseContext) {
    context.loaderNotification?.progress.report({ increment: 25 })
    setTimeout(() => {
        context.loaderNotification?.resolve()
    }, 100)
}

/**
 * Handles unsupported or unrecognized messages by sending a response to the webview. Ensures compatibility with future
 * commands and message types, preventing issues if the user has an outdated extension version.
 * @param context The context object containing information about the webview environment
 * @param command The command received from the webview
 * @param messageType The type of the message received
 */
export async function handleUnsupportedMessage(context: BaseContext, originalMessage: Message) {
    await context.panel.webview.postMessage({
        messageType: MessageType.RESPONSE,
        command: Command.UNSUPPORTED_COMMAND,
        originalMessage,
    } as UnsupportedMessage)
}

/**
 * Handler for making API calls from the webview and returning the response.
 * @param request The request message containing the API to call and the parameters
 * @param context The webview context used for returning the API response to the webview
 * @param region The AWS region to use for the API calls
 */
export function apiCallMessageHandler(request: ApiCallRequestMessage, context: BaseContext, region: string) {
    const logger = getLogger('stepfunctions')
    const apiHandler = new StepFunctionApiHandler(region, context)
    apiHandler.performApiCall(request).catch((error) => logger.error('%s API call failed: %O', request.apiName, error))
}
