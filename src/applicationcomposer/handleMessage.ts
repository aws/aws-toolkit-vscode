/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { loadFileMessageHandler } from './messageHandlers/loadFileMessageHandler'
import { initMessageHandler } from './messageHandlers/initMessageHandler'
import {
    Command,
    LoadFileRequestMessage,
    Message,
    WebviewContext,
    SaveFileRequestMessage,
    AddFileWatchRequestMessage,
    MessageType,
} from './types'
import { saveFileMessageHandler } from './messageHandlers/saveFileMessageHandler'
import { addFileWatchMessageHandler } from './messageHandlers/addFileWatchMessageHandler'
import { deployMessageHandler } from './messageHandlers/deployMessageHandler'

export async function handleMessage(message: unknown, context: WebviewContext) {
    const composerMessage = message as Message

    const { command, messageType } = composerMessage

    if (command === Command.INIT && messageType === MessageType.REQUEST) {
        initMessageHandler(context)
    } else if (command === Command.LOAD_FILE && messageType === MessageType.REQUEST) {
        await loadFileMessageHandler(message as LoadFileRequestMessage, context)
    } else if (command === Command.SAVE_FILE && messageType === MessageType.REQUEST) {
        await saveFileMessageHandler(message as SaveFileRequestMessage, context)
    } else if (command === Command.ADD_FILE_WATCH && messageType === MessageType.REQUEST) {
        addFileWatchMessageHandler(message as AddFileWatchRequestMessage, context)
    } else if (command === Command.DEPLOY && messageType === MessageType.REQUEST) {
        deployMessageHandler(context)
    }
}
