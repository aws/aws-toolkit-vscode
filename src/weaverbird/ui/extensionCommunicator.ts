/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ChatItem, NotificationType } from '@aws/mynah-ui-chat'
import { messageIdentifier, MessageActionType } from '../models'

window.ideApi = acquireVsCodeApi()

export interface ExtensionCommunicatorProps {
    onChatItemRecieved: (tabId: string, chatItem: ChatItem) => void
    onChatStreamRecieved: (tabId: string, chatStream: string) => void
    onLoadingStateChangeRecieved: (tabId: string, loadingState: boolean) => void
    onNotificationRequestRecieved?: (notification: {
        title: string
        content: string
        type?: NotificationType
        duration?: 2500
    }) => void
    onOpenDiff?: (props: { leftPath: string; rightPath: string; title: string }) => void
}

export class ExtensionCommunicator {
    private readonly props: ExtensionCommunicatorProps
    private readonly postMessageToExtension = window.ideApi.postMessage
    constructor(props: ExtensionCommunicatorProps) {
        this.props = props
        window.addEventListener('message', this.handleMessageRecieve)
    }

    private readonly parseMessageData: any = (data: string) => {
        try {
            return JSON.parse(data)
        } catch (err) {
            return undefined
        }
    }

    private readonly handleMessageRecieve = (message: MessageEvent): void => {
        const messageData = this.parseMessageData(message.data)
        if (messageData && messageData.sender === messageIdentifier) {
            switch (messageData.action) {
                case MessageActionType.CHAT_ANSWER:
                    this.props.onChatItemRecieved(messageData.tabId, messageData.data)
                    break
                case MessageActionType.CHAT_STREAM:
                    this.props.onChatStreamRecieved(messageData.tabId, messageData.data)
                    break
                case MessageActionType.SPINNER_STATE:
                    this.props.onLoadingStateChangeRecieved(messageData.tabId, messageData.data)
                    break
                case MessageActionType.NOTIFY:
                    if (this.props.onNotificationRequestRecieved !== undefined) {
                        this.props.onNotificationRequestRecieved(messageData.data)
                    }
                    break
                case MessageActionType.OPEN_DIFF:
                    this.props.onOpenDiff?.(messageData.data)
                    break
            }
        }
    }

    public sendMessageToExtension = (message: { action: MessageActionType; data?: any; tabId?: string }): void => {
        this.postMessageToExtension({
            action: message.action,
            data: JSON.stringify(message.data),
            tabId: message.tabId,
        })
    }
}
