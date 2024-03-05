/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Command,
    EmitTelemetryMessage,
    LogMessage,
    Message,
    WebviewContext,
    SaveFileRequestMessage,
    MessageType,
} from './types'
import { saveFileMessageHandler } from './messageHandlers/saveFileMessageHandler'
import { logMessageHandler } from './messageHandlers/logMessageHandler'
import { emitTelemetryMessageHandler } from './messageHandlers/emitTelemetryMessageHandler'
import { openFeedbackMessageHandler } from './messageHandlers/openFeedbackMessageHandler'

export async function handleMessage(message: unknown, context: WebviewContext) {
    const composerMessage = message as Message

    const { command, messageType } = composerMessage

    if (messageType === MessageType.REQUEST) {
        switch (command) {
            case Command.SAVE_FILE:
                void saveFileMessageHandler(message as SaveFileRequestMessage, context)
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
