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
    private docGenerationControllerEventsEmitters: ChatControllerEventEmitters | undefined
    private webViewMessageListener: MessageListener<any>

    constructor(props: UIMessageListenerProps) {
        this.docGenerationControllerEventsEmitters = props.chatControllerEventEmitters
        this.webViewMessageListener = props.webViewMessageListener

        // Now we are listening to events that get sent from amazonq/webview/actions/actionListener (e.g. the tab)
        this.webViewMessageListener.onMessage((msg) => {
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
            case 'chat-item-feedback':
                this.chatItemFeedback(msg)
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
            case 'file-click':
                this.fileClicked(msg)
                break
            case 'form-action-click':
                this.formActionClicked(msg)
                break
        }
    }

    private chatItemVoted(msg: any) {
        this.docGenerationControllerEventsEmitters?.processChatItemVotedMessage.fire({
            tabID: msg.tabID,
            command: msg.command,
            vote: msg.vote,
            messageId: msg.messageId,
        })
    }

    private chatItemFeedback(msg: any) {
        this.docGenerationControllerEventsEmitters?.processChatItemFeedbackMessage.fire(msg)
    }

    private processChatMessage(msg: any) {
        this.docGenerationControllerEventsEmitters?.processHumanChatMessage.fire({
            message: msg.chatMessage,
            tabID: msg.tabID,
        })
    }

    private followUpClicked(msg: any) {
        this.docGenerationControllerEventsEmitters?.followUpClicked.fire({
            followUp: msg.followUp,
            tabID: msg.tabID,
        })
    }

    private formActionClicked(msg: any) {
        this.docGenerationControllerEventsEmitters?.formActionClicked.fire({
            ...msg,
        })
    }

    private fileClicked(msg: any) {
        this.docGenerationControllerEventsEmitters?.fileClicked.fire({
            tabID: msg.tabID,
            filePath: msg.filePath,
            actionName: msg.actionName,
            messageId: msg.messageId,
        })
    }

    private openDiff(msg: any) {
        this.docGenerationControllerEventsEmitters?.openDiff.fire({
            tabID: msg.tabID,
            filePath: msg.filePath,
            deleted: msg.deleted,
            messageId: msg.messageId,
        })
    }

    private stopResponse(msg: any) {
        this.docGenerationControllerEventsEmitters?.stopResponse.fire({
            tabID: msg.tabID,
        })
    }

    private tabOpened(msg: any) {
        this.docGenerationControllerEventsEmitters?.tabOpened.fire({
            tabID: msg.tabID,
        })
    }

    private tabClosed(msg: any) {
        this.docGenerationControllerEventsEmitters?.tabClosed.fire({
            tabID: msg.tabID,
        })
    }

    private authClicked(msg: any) {
        this.docGenerationControllerEventsEmitters?.authClicked.fire({
            tabID: msg.tabID,
            authType: msg.authType,
        })
    }

    private processResponseBodyLinkClick(msg: any) {
        this.docGenerationControllerEventsEmitters?.processResponseBodyLinkClick.fire({
            command: msg.command,
            messageId: msg.messageId,
            tabID: msg.tabID,
            link: msg.link,
        })
    }

    private insertCodeAtPosition(msg: any) {
        this.docGenerationControllerEventsEmitters?.insertCodeAtPositionClicked.fire({
            command: msg.command,
            messageId: msg.messageId,
            tabID: msg.tabID,
            code: msg.code,
            insertionTargetType: msg.insertionTargetType,
            codeReference: msg.codeReference,
        })
    }
}
