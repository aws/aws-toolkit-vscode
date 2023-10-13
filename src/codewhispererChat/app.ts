/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'vscode'
import { ChatController as CwChatController } from '../codewhispererChat/controllers/chat/controller'
import { UIMessageListener } from './view/messages/messageListener'
import { AwsQAppInitContext } from '../awsq/apps/initContext'
import { MessageListener } from '../awsq/messages/messageListener'
import { MessagePublisher } from '../awsq/messages/messagePublisher'
import {
    InsertCodeAtCursorPostion,
    PromptMessage,
    TabClosedMessage,
    TriggerTabIDReceived,
} from './controllers/chat/model'
import { EditorContextCommand, registerCommands } from './commands/registerCommands'

export function init(appContext: AwsQAppInitContext) {
    const cwChatControllerEventEmitters = {
        processPromptChatMessage: new EventEmitter<PromptMessage>(),
        processTabClosedMessage: new EventEmitter<TabClosedMessage>(),
        processInsertCodeAtCursorPosition: new EventEmitter<InsertCodeAtCursorPostion>(),
        processContextMenuCommand: new EventEmitter<EditorContextCommand>(),
        processTriggerTabIDReceived: new EventEmitter<TriggerTabIDReceived>(),
    }

    const cwChatControllerMessageListeners = {
        processPromptChatMessage: new MessageListener<PromptMessage>(
            cwChatControllerEventEmitters.processPromptChatMessage
        ),
        processTabClosedMessage: new MessageListener<TabClosedMessage>(
            cwChatControllerEventEmitters.processTabClosedMessage
        ),
        processInsertCodeAtCursorPosition: new MessageListener<InsertCodeAtCursorPostion>(
            cwChatControllerEventEmitters.processInsertCodeAtCursorPosition
        ),
        processContextMenuCommand: new MessageListener<EditorContextCommand>(
            cwChatControllerEventEmitters.processContextMenuCommand
        ),
        processTriggerTabIDReceived: new MessageListener<TriggerTabIDReceived>(
            cwChatControllerEventEmitters.processTriggerTabIDReceived
        ),
    }

    const cwChatControllerMessagePublishers = {
        processPromptChatMessage: new MessagePublisher<PromptMessage>(
            cwChatControllerEventEmitters.processPromptChatMessage
        ),
        processTabClosedMessage: new MessagePublisher<TabClosedMessage>(
            cwChatControllerEventEmitters.processTabClosedMessage
        ),
        processInsertCodeAtCursorPosition: new MessagePublisher<InsertCodeAtCursorPostion>(
            cwChatControllerEventEmitters.processInsertCodeAtCursorPosition
        ),
        processContextMenuCommand: new MessagePublisher<EditorContextCommand>(
            cwChatControllerEventEmitters.processContextMenuCommand
        ),
        processTriggerTabIDReceived: new MessagePublisher<TriggerTabIDReceived>(
            cwChatControllerEventEmitters.processTriggerTabIDReceived
        ),
    }

    new CwChatController(cwChatControllerMessageListeners, appContext.getAppsToWebViewMessagePublisher())

    const cwChatUIInputEventEmmiter = new EventEmitter<any>()

    new UIMessageListener({
        chatControllerMessagePublishers: cwChatControllerMessagePublishers,
        webViewMessageListener: new MessageListener<any>(cwChatUIInputEventEmmiter),
    })

    appContext.registerWebViewToAppMessagePublisher(new MessagePublisher<any>(cwChatUIInputEventEmmiter), 'cwc')

    registerCommands(cwChatControllerMessagePublishers)
}
