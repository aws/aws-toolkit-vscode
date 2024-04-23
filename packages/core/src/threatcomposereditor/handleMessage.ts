/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command, LogMessage, Message, WebviewContext, SaveFileRequestMessage, MessageType } from './types'
import { autoSaveFileMessageHandler, saveFileMessageHandler } from './messageHandlers/saveFileMessageHandler'
import { logMessageHandler } from './messageHandlers/logMessageHandler'
import { openFeedbackMessageHandler } from './messageHandlers/openFeedbackMessageHandler'
import { initMessageHandler, reloadMessageHandler } from './messageHandlers/initMessageHandler'

export async function handleMessage(message: unknown, context: WebviewContext) {
    const composerMessage = message as Message

    const { command, messageType } = composerMessage

    if (messageType === MessageType.REQUEST) {
        switch (command) {
            case Command.AUTO_SAVE_FILE:
                void autoSaveFileMessageHandler(message as SaveFileRequestMessage, context)
                break
            case Command.SAVE_FILE:
                void saveFileMessageHandler(message as SaveFileRequestMessage, context)
                break
            case Command.INIT:
                void initMessageHandler(context)
                break
            case Command.RELOAD:
                void reloadMessageHandler(context)
        }
    } else if (messageType === MessageType.BROADCAST) {
        switch (command) {
            case Command.LOG:
                void logMessageHandler(message as LogMessage)
                break
            case Command.OPEN_FEEDBACK:
                openFeedbackMessageHandler()
                break
        }
    }
}
