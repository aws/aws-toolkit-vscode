/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { loadFileMessageHandler } from './messageHandlers/loadFileMessageHandler'
import { initMessageHandler } from './messageHandlers/initMessageHandler'
import {
    Command,
    EmitTelemetryMessage,
    LoadFileRequestMessage,
    LogMessage,
    Message,
    WebviewContext,
    SaveFileRequestMessage,
    AddFileWatchRequestMessage,
    GenerateResourceRequestMessage,
    MessageType,
    DeployRequestMessage,
} from './types'
import { saveFileMessageHandler } from './messageHandlers/saveFileMessageHandler'
import { addFileWatchMessageHandler } from './messageHandlers/addFileWatchMessageHandler'
import { deployMessageHandler } from './messageHandlers/deployMessageHandler'
import { generateResourceHandler } from './messageHandlers/generateResourceHandler'
import { logMessageHandler } from './messageHandlers/logMessageHandler'
import { emitTelemetryMessageHandler } from './messageHandlers/emitTelemetryMessageHandler'
import { openFeedbackMessageHandler } from './messageHandlers/openFeedbackMessageHandler'

export async function handleMessage(message: unknown, context: WebviewContext) {
    const composerMessage = message as Message

    const { command, messageType } = composerMessage

    if (messageType === MessageType.REQUEST) {
        switch (command) {
            case Command.INIT:
                void initMessageHandler(context)
                break
            case Command.LOAD_FILE:
                void loadFileMessageHandler(message as LoadFileRequestMessage, context)
                break
            case Command.SAVE_FILE:
                void saveFileMessageHandler(message as SaveFileRequestMessage, context)
                break
            case Command.ADD_FILE_WATCH:
                void addFileWatchMessageHandler(message as AddFileWatchRequestMessage, context)
                break
            case Command.DEPLOY:
                void deployMessageHandler(message as DeployRequestMessage, context)
                break
            case Command.GENERATE_RESOURCE:
                void generateResourceHandler(message as GenerateResourceRequestMessage, context)
                break
        }
    } else if (messageType === MessageType.BROADCAST) {
        switch (command) {
            case Command.LOG:
                logMessageHandler(message as LogMessage)
                break
            case Command.EMIT_TELEMETRY:
                emitTelemetryMessageHandler(message as EmitTelemetryMessage)
                break
            case Command.OPEN_FEEDBACK:
                openFeedbackMessageHandler()
                break
        }
    }
}
