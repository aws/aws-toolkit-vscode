/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatControllerEventEmitters } from '../../controllers/chat/controller'
import { MessageListener } from '../../../awsq/messages/messageListener'
import { ExtensionMessage } from '../../../awsq/webview/ui/commands'

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

    private handleMessage(msg: ExtensionMessage) {
        switch (msg.command) {
            case 'chat-prompt':
                this.processChatMessage(msg)
                break
            case 'follow-up-was-clicked':
                this.followUpClicked(msg)
                break
            case 'open-diff':
                this.openDiff(msg)
                break
            case 'stop-response':
                this.stopResponse(msg)
                break
            case 'new-tab-was-created':
                this.tabOpened(msg)
                break
            case 'tab-was-removed':
                this.tabClosed(msg)
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

    private stopResponse(msg: any) {
        this.weaverbirdControllerEventsEmitters?.stopResponse.fire({
            tabID: msg.tabID,
        })
    }

    private tabOpened(msg: any) {
        this.weaverbirdControllerEventsEmitters?.tabOpened.fire({
            tabID: msg.tabID,
        })
    }

    private tabClosed(msg: any) {
        this.weaverbirdControllerEventsEmitters?.tabClosed.fire({
            tabID: msg.tabID,
        })
    }
}
