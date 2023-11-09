/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { loadFileMessageHandler } from './messageHandlers/loadFileMessageHandler'
import { initMessageHandler } from './messageHandlers/initMessageHandler'
import {
    Command,
    LoadFileRequestMessage,
    RequestMessage,
    WebviewContext,
    SaveFileRequestMessage,
    AddFileWatchRequestMessage,
    GenerateResourceMessage,
} from './types'
import { saveFileMessageHandler } from './messageHandlers/saveFileMessageHandler'
import { addFileWatchMessageHandler } from './messageHandlers/addFileWatchMessageHandler'
import { deployMessageHandler } from './messageHandlers/deployMessageHandler'
import { generateResourceHandler } from './messageHandlers/generateResourceHandler'

export async function handleRequestMessage(request: unknown, context: WebviewContext) {
    const requestMessage = request as RequestMessage
    switch (requestMessage.command) {
        case Command.INIT:
            initMessageHandler(context)
            break
        case Command.LOAD_FILE:
            await loadFileMessageHandler(request as LoadFileRequestMessage, context)
            break
        case Command.SAVE_FILE:
            saveFileMessageHandler(request as SaveFileRequestMessage, context)
            break
        case Command.ADD_FILE_WATCH:
            addFileWatchMessageHandler(request as AddFileWatchRequestMessage, context)
            break
        case Command.DEPLOY:
            deployMessageHandler(context)
            break
        case Command.GENERATE_RESOURCE:
            generateResourceHandler(request as GenerateResourceMessage, context)
            break
    }
}
