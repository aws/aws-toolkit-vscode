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

    if (messageType === MessageType.REQUEST) {
        switch (command) {
            case Command.INIT:
                initMessageHandler(context)
                break
            case Command.LOAD_FILE:
                await loadFileMessageHandler(message as LoadFileRequestMessage, context)
                break
            case Command.SAVE_FILE:
                await saveFileMessageHandler(message as SaveFileRequestMessage, context)
                break
            case Command.ADD_FILE_WATCH:
                addFileWatchMessageHandler(message as AddFileWatchRequestMessage, context)
                break
            case Command.DEPLOY:
                deployMessageHandler(context)
                break
        }
    }
}
