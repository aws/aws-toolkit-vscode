/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatControllerEventEmitters } from '../../controllers/chat/controller'
import { MessageListener } from '../../../amazonq/messages/messageListener'
import { ExtensionMessage } from '../../../amazonq/webview/ui/commands'

export interface UIMessageListenerProps {
    readonly chatControllerEventEmitters: ChatControllerEventEmitters
    readonly webViewMessageListener: MessageListener<any>
}

export class UIMessageListener {
    private featureDevControllerEventsEmitters: ChatControllerEventEmitters | undefined
    private webViewMessageListener: MessageListener<any>

    constructor(props: UIMessageListenerProps) {
        this.featureDevControllerEventsEmitters = props.chatControllerEventEmitters
        this.webViewMessageListener = props.webViewMessageListener

        // Now we are listening to events that get sent from amazonq/webview/actions/actionListener (e.g. the tab)
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
            case 'chat-item-voted':
                this.chatItemVoted(msg)
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
            case 'auth-follow-up-was-clicked':
                this.authClicked(msg)
                break
            case 'response-body-link-click':
                this.processResponseBodyLinkClick(msg)
                break
            case 'insert_code_at_cursor_position':
                this.insertCodeAtPosition(msg)
                break
        }
    }

    private chatItemVoted(msg: any) {
        this.featureDevControllerEventsEmitters?.processChatItemVotedMessage.fire({
            tabID: msg.tabID,
            command: msg.command,
            vote: msg.vote,
            messageId: msg.messageId,
        })
    }

    private processChatMessage(msg: any) {
        this.featureDevControllerEventsEmitters?.processHumanChatMessage.fire({
            message: msg.chatMessage,
            tabID: msg.tabID,
        })
    }

    private followUpClicked(msg: any) {
        this.featureDevControllerEventsEmitters?.followUpClicked.fire({
            followUp: msg.followUp,
            tabID: msg.tabID,
        })
    }

    private openDiff(msg: any) {
        this.featureDevControllerEventsEmitters?.openDiff.fire({
            tabID: msg.tabID,
            filePath: msg.filePath,
            deleted: msg.deleted,
        })
    }

    private stopResponse(msg: any) {
        this.featureDevControllerEventsEmitters?.stopResponse.fire({
            tabID: msg.tabID,
        })
    }

    private tabOpened(msg: any) {
        this.featureDevControllerEventsEmitters?.tabOpened.fire({
            tabID: msg.tabID,
        })
    }

    private tabClosed(msg: any) {
        this.featureDevControllerEventsEmitters?.tabClosed.fire({
            tabID: msg.tabID,
        })
    }

    private authClicked(msg: any) {
        this.featureDevControllerEventsEmitters?.authClicked.fire({
            tabID: msg.tabID,
            authType: msg.authType,
        })
    }

    private processResponseBodyLinkClick(msg: any) {
        this.featureDevControllerEventsEmitters?.processResponseBodyLinkClick.fire({
            command: msg.command,
            messageId: msg.messageId,
            tabID: msg.tabID,
            link: msg.link,
        })
    }

    private insertCodeAtPosition(msg: any) {
        this.featureDevControllerEventsEmitters?.insertCodeAtPositionClicked.fire({
            command: msg.command,
            messageId: msg.messageId,
            tabID: msg.tabID,
            code: msg.code,
            insertionTargetType: msg.insertionTargetType,
            codeReference: msg.codeReference,
        })
    }
}
