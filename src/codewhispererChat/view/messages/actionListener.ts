/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageListener } from '../../../awsq/messages/messageListener'
import { MessageCommand } from '../../../awsq/webview/ui/commands'
import { ChatControllerMessagePublishers } from '../../controllers/chat/controller'

export interface UIMessageListenerProps {
    readonly chatControllerMessagePublishers: ChatControllerMessagePublishers
    readonly webViewMessageListener: MessageListener<any>
}

export class UIMessageListener {
    private chatControllerMessagePublishers: ChatControllerMessagePublishers
    private webViewMessageListener: MessageListener<any>

    constructor(props: UIMessageListenerProps) {
        this.chatControllerMessagePublishers = props.chatControllerMessagePublishers
        this.webViewMessageListener = props.webViewMessageListener

        this.webViewMessageListener.onMessage(msg => {
            this.handleMessage(msg)
        })
    }

    private handleMessage(msg: any) {
        switch (msg.command) {
            case MessageCommand.CHAT_PROMPT:
                this.processChatMessage(msg)
                break
            case MessageCommand.NEW_TAB_WAS_CREATED:
                this.processNewTabWasCreated(msg)
                break
            case MessageCommand.TAB_WAS_REMOVED:
                this.processTabWasRemoved(msg)
                break
        }
    }

    private processTabWasRemoved(msg: any) {
        this.chatControllerMessagePublishers.processTabClosedMessage.publish({
            tabID: msg.tabID,
        })
    }

    private processNewTabWasCreated(msg: any) {
        return
    }

    private processChatMessage(msg: any) {
        this.chatControllerMessagePublishers.processPromptChatMessage.publish({
            message: msg.chatMessage,
            tabID: msg.tabID,
        })
    }
}
