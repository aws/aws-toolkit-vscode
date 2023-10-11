/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'vscode'
import { ChatController as CwChatController } from '../codewhispererChat/controllers/chat/controller'
import { UIMessageListener } from './view/messages/actionListener'
import { AwsQAppInitContext } from '../awsq/apps/initContext'
import { MessageListener } from '../awsq/messages/messageListener'
import { MessagePublisher } from '../awsq/messages/messagePublisher'
import { PromptMessage, TabClosedMessage } from './controllers/chat/model'
import { TabType } from '../awsq/webview/ui/storages/tabTypeStorage'

export function init(appContext: AwsQAppInitContext) {
    const cwChatControllerEventEmitters = {
        processPromptChatMessage: new EventEmitter<PromptMessage>(),
        processTabClosedMessage: new EventEmitter<TabClosedMessage>(),
    }

    const cwChatControllerMessageListeners = {
        processPromptChatMessage: new MessageListener<PromptMessage>(
            cwChatControllerEventEmitters.processPromptChatMessage
        ),
        processTabClosedMessage: new MessageListener<TabClosedMessage>(
            cwChatControllerEventEmitters.processTabClosedMessage
        ),
    }

    const cwChatControllerMessagePublishers = {
        processPromptChatMessage: new MessagePublisher<PromptMessage>(
            cwChatControllerEventEmitters.processPromptChatMessage
        ),
        processTabClosedMessage: new MessagePublisher<TabClosedMessage>(
            cwChatControllerEventEmitters.processTabClosedMessage
        ),
    }

    new CwChatController(cwChatControllerMessageListeners, appContext.getAppsToWebViewMessagePublisher())

    const cwChatUIInputEventEmmiter = new EventEmitter<any>()

    new UIMessageListener({
        chatControllerMessagePublishers: cwChatControllerMessagePublishers,
        webViewMessageListener: new MessageListener<any>(cwChatUIInputEventEmmiter),
    })

    appContext.registerWebViewToAppMessagePublisher(
        new MessagePublisher<any>(cwChatUIInputEventEmmiter),
        TabType.CodeWhispererChat
    )
}
