/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageListener } from '../../../amazonq/messages/messageListener'
import { ExtensionMessage } from '../../../amazonq/webview/ui/commands'
import { ChatControllerMessagePublishers } from '../../controllers/chat/controller'
import { ReferenceLogController } from './referenceLogController'

export interface UIMessageListenerProps {
    readonly chatControllerMessagePublishers: ChatControllerMessagePublishers
    readonly webViewMessageListener: MessageListener<any>
}

export class UIMessageListener {
    private chatControllerMessagePublishers: ChatControllerMessagePublishers
    private webViewMessageListener: MessageListener<any>
    private referenceLogController: ReferenceLogController

    constructor(props: UIMessageListenerProps) {
        this.chatControllerMessagePublishers = props.chatControllerMessagePublishers
        this.webViewMessageListener = props.webViewMessageListener
        this.referenceLogController = new ReferenceLogController()

        this.webViewMessageListener.onMessage(msg => {
            this.handleMessage(msg)
        })
    }

    private handleMessage(msg: ExtensionMessage) {
        switch (msg.command) {
            case 'onboarding-page-interaction':
                this.processOnboardingPageInteraction(msg)
                break
            case 'clear':
            case 'chat-prompt':
                this.processChatMessage(msg)
                break
            case 'new-tab-was-created':
                this.processNewTabWasCreated(msg)
                break
            case 'tab-was-removed':
                this.processTabWasRemoved(msg)
                break
            case 'tab-was-changed':
                this.processTabWasChanged(msg)
                break
            case 'follow-up-was-clicked':
                if (msg.followUp?.prompt !== undefined) {
                    this.processChatMessage({
                        chatMessage: msg.followUp.prompt,
                        tabID: msg.tabID,
                        command: msg.command,
                        messageId: msg.messageId,
                        userIntent: msg.followUp.type,
                    })
                }
                break
            case 'code_was_copied_to_clipboard':
                this.processCodeWasCopiedToClipboard(msg)
                break
            case 'insert_code_at_cursor_position':
                this.processInsertCodeAtCursorPosition(msg)
                break
            case 'trigger-tabID-received':
                this.processTriggerTabIDReceived(msg)
                break
            case 'stop-response':
                this.stopResponse(msg)
                break
            case 'chat-item-voted':
                this.chatItemVoted(msg)
                break
            case 'chat-item-feedback':
                this.chatItemFeedback(msg)
                break
            case 'ui-focus':
                this.processUIFocus(msg)
                break
            case 'link-was-clicked':
                this.linkClicked(msg)
                break
        }
    }

    private linkClicked(msg: any) {
        this.chatControllerMessagePublishers.processLinkClicked.publish({
            command: msg.command,
            tabID: msg.tabID,
            messageId: msg.messageId,
            url: msg.link,
        })
    }

    private processOnboardingPageInteraction(msg: any) {
        this.chatControllerMessagePublishers.processOnboardingPageInteraction.publish({
            type: msg.type,
        })
    }
    private processUIFocus(msg: any) {
        this.chatControllerMessagePublishers.processUIFocusMessage.publish({
            command: msg.command,
            type: msg.type,
        })
    }

    private processTriggerTabIDReceived(msg: any) {
        this.chatControllerMessagePublishers.processTriggerTabIDReceived.publish({
            tabID: msg.tabID,
            triggerID: msg.triggerID,
        })
    }

    private processInsertCodeAtCursorPosition(msg: any) {
        this.referenceLogController.addReferenceLog(msg.codeReference)
        this.chatControllerMessagePublishers.processInsertCodeAtCursorPosition.publish({
            command: msg.command,
            tabID: msg.tabID,
            messageId: msg.messageId,
            code: msg.code,
            insertionTargetType: msg.insertionTargetType,
        })
    }

    private processCodeWasCopiedToClipboard(msg: any) {
        this.chatControllerMessagePublishers.processCopyCodeToClipboard.publish({
            command: msg.command,
            tabID: msg.tabID,
            messageId: msg.messageId,
            code: msg.code,
            insertionTargetType: msg.insertionTargetType,
        })
    }

    private processTabWasRemoved(msg: any) {
        this.chatControllerMessagePublishers.processTabClosedMessage.publish({
            tabID: msg.tabID,
        })
    }

    private processNewTabWasCreated(msg: any) {
        this.chatControllerMessagePublishers.processTabCreatedMessage.publish({
            tabID: msg.tabID,
            tabOpenInteractionType: msg.tabOpenInteractionType,
        })
    }

    private processTabWasChanged(msg: any) {
        this.chatControllerMessagePublishers.processTabChangedMessage.publish({
            tabID: msg.tabID,
            prevTabID: msg.prevTabID,
        })
    }

    private processChatMessage(msg: any) {
        this.chatControllerMessagePublishers.processPromptChatMessage.publish({
            message: msg.chatMessage,
            command: msg.command,
            tabID: msg.tabID,
            messageId: msg.messageId,
            userIntent: msg.userIntent !== '' ? msg.userIntent : undefined,
        })
    }

    private stopResponse(msg: any) {
        this.chatControllerMessagePublishers.processStopResponseMessage.publish({
            tabID: msg.tabID,
        })
    }

    private chatItemVoted(msg: any) {
        this.chatControllerMessagePublishers.processChatItemVotedMessage.publish({
            tabID: msg.tabID,
            command: msg.command,
            vote: msg.vote,
            messageId: msg.messageId,
        })
    }

    private async chatItemFeedback(msg: any) {
        this.chatControllerMessagePublishers.processChatItemFeedbackMessage.publish({
            messageId: msg.messageId,
            tabID: msg.tabID,
            command: msg.command,
            selectedOption: msg.selectedOption,
            comment: msg.comment,
        })
    }
}
