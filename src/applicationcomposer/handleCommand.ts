/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { loadFileMessageHandler } from './messageHandlers/loadFileMessageHandler'
import { initMessageHandler } from './messageHandlers/initMessageHandler'
import { Command, LoadFileRequestMessage, RequestMessage, WebviewContext, SaveFileRequestMessage } from './types'
import { saveFileMessageHandler } from './messageHandlers/saveFileMessageHandler'

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
    }
}
