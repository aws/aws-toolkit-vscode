/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatControllerEventEmitters } from '../../controllers/chat/controller'
import { MessageListener } from '../../../awsq/messages/messageListener'
import { MessageCommand } from '../../../awsq/webview/ui/commands'

export const weaverbirdChat = 'weaverbirdChat'

export interface UIMessageListenerProps {
    readonly chatControllerEventEmitters: ChatControllerEventEmitters
    readonly webViewMessageListener: MessageListener<any>
}

export class UIMessageListener {
    private weaverbirdControllerEventsEmitters: ChatControllerEventEmitters | undefined
    private webViewMessageListener: MessageListener<any>

    constructor(props: UIMessageListenerProps) {
        this.weaverbirdControllerEventsEmitters = props.chatControllerEventEmitters
        this.webViewMessageListener = props.webViewMessageListener

        // Now we are listening to events that get sent from awsq/webview/actions/actionListener (e.g. the tab)
        this.webViewMessageListener.onMessage(msg => {
            this.handleMessage(msg)
        })
    }

    private handleMessage(msg: any) {
        switch (msg.command) {
            case MessageCommand.CHAT_PROMPT:
                this.processChatMessage(msg)
                break
            case MessageCommand.FOLLOW_UP_WAS_CLICKED:
                this.followUpClicked(msg)
                break
            case MessageCommand.OPEN_DIFF:
                this.openDiff(msg)
                break
        }
    }

    private processChatMessage(msg: any) {
        this.weaverbirdControllerEventsEmitters?.processHumanChatMessage.fire({
            message: msg.chatMessage,
            tabID: msg.tabID,
        })
    }

    private followUpClicked(msg: any) {
        this.weaverbirdControllerEventsEmitters?.followUpClicked.fire({
            followUp: msg.followUp,
            tabID: msg.tabID,
        })
    }

    private openDiff(msg: any) {
        this.weaverbirdControllerEventsEmitters?.openDiff.fire({
            tabID: msg.tabID,
            leftPath: msg.leftPath,
            rightPath: msg.rightPath,
        })
    }
}
