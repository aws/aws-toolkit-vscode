/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'vscode'
import { UIMessageListener } from './views/actions/uiMessageListener'
import { WeaverbirdController } from './controllers/chat/controller'
import { AwsQAppInitContext } from '../awsq/apps/initContext'
import { MessagePublisher } from '../awsq/messages/messagePublisher'
import { MessageListener } from '../awsq/messages/messageListener'

export function init(appContext: AwsQAppInitContext) {
    const weaverbirdChatControllerEventEmitters = {
        processHumanChatMessage: new EventEmitter<any>(),
        followUpClicked: new EventEmitter<any>(),
    }

    new WeaverbirdController(weaverbirdChatControllerEventEmitters, appContext.getAppsToWebViewMessagePublisher())

    const weaverbirdChatUIInputEventEmitter = new EventEmitter<any>()

    new UIMessageListener({
        chatControllerEventEmitters: weaverbirdChatControllerEventEmitters,
        webViewMessageListener: new MessageListener<any>(weaverbirdChatUIInputEventEmitter),
    })

    appContext.registerWebViewToAppMessagePublisher(new MessagePublisher<any>(weaverbirdChatUIInputEventEmitter))
}
