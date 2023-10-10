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

export function init(appContext: AwsQAppInitContext) {
    const cwChatControllerEventEmitters = {
        processHumanChatMessage: new EventEmitter<any>(),
    }

    new CwChatController(cwChatControllerEventEmitters, appContext.getAppsToWebViewMessagePublisher())

    const cwChatUIInputEventEmmiter = new EventEmitter<any>()

    new UIMessageListener({
        chatControllerEventEmitters: cwChatControllerEventEmitters,
        webViewMessageListener: new MessageListener<any>(cwChatUIInputEventEmmiter),
    })

    appContext.registerWebViewToAppMessagePublisher(new MessagePublisher<any>(cwChatUIInputEventEmmiter))
}
