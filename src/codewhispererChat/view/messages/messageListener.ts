/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vs from 'vscode'
import { MessageListener } from '../../../awsq/messages/messageListener'
import { ExtensionMessage } from '../../../awsq/webview/ui/commands'
import { ReferenceLogViewProvider } from '../../../codewhisperer/service/referenceLogViewProvider'
import globals from '../../../shared/extensionGlobals'
import { getLogger } from '../../../shared/logger'
import { telemetry } from '../../../shared/telemetry/telemetry'
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

    private handleMessage(msg: ExtensionMessage) {
        switch (msg.command) {
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
            case 'follow-up-was-clicked':
                // TODO if another api is available for follow ups
                // connect to that instead of using prompt handler
                if (msg.followUp?.prompt !== undefined) {
                    this.processChatMessage({
                        chatMessage: msg.followUp.prompt,
                        tabID: msg.tabID,
                        command: msg.command,
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
        }
    }

    private processTriggerTabIDReceived(msg: any) {
        this.chatControllerMessagePublishers.processTriggerTabIDReceived.publish({
            tabID: msg.tabID,
            triggerID: msg.triggerID,
        })
    }

    private processInsertCodeAtCursorPosition(msg: any) {
        if (msg.codeReference !== undefined && vs.window.activeTextEditor !== undefined) {
            const referenceLog = ReferenceLogViewProvider.getReferenceLog(
                '',
                msg.codeReference,
                vs.window.activeTextEditor as vs.TextEditor
            )
            ReferenceLogViewProvider.instance.addReferenceLog(referenceLog)
        }
        this.chatControllerMessagePublishers.processInsertCodeAtCursorPosition.publish({
            command: msg.command,
            tabID: msg.tabID,
            code: msg.code,
            insertionTargetType: msg.insertionTargetType,
        })
    }

    private processCodeWasCopiedToClipboard(msg: any) {
        this.chatControllerMessagePublishers.processCopyCodeToClipboard.publish({
            command: msg.command,
            tabID: msg.tabID,
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
        telemetry.codewhispererchat_openChat.emit({ cwsprChatTriggerInteraction: 'click' })
    }

    private processChatMessage(msg: any) {
        this.chatControllerMessagePublishers.processPromptChatMessage.publish({
            message: msg.chatMessage,
            command: msg.command,
            tabID: msg.tabID,
            userIntent: msg.userIntent,
        })
    }

    private stopResponse(msg: any) {
        this.chatControllerMessagePublishers.processStopResponseMessage.publish({
            tabID: msg.tabID,
        })
    }

    private chatItemVoted(msg: any) {
        // TODO add telemetry records
        if (!globals.telemetry.telemetryEnabled) {
            return
        }
        telemetry.codewhispererchat_interactWithMessage.emit({
            // TODO Those are not the real messageId and conversationId, needs to be confirmed
            cwsprChatMessageId: msg.messageId,
            cwsprChatConversationId: msg.tabID,
            cwsprChatInteractionType: msg.vote,
        })
    }

    private async chatItemFeedback(msg: any) {
        // TODO add telemetry records
        if (!globals.telemetry.telemetryEnabled) {
            return
        }
        const logger = getLogger()
        try {
            await globals.telemetry.postFeedback({
                comment: JSON.stringify({
                    type: 'codewhisperer-chat-answer-feedback',
                    sessionId: msg.messageId,
                    requestId: msg.tabId,
                    reason: msg.selectedOption,
                    userComment: msg.comment,
                }),
                sentiment: 'Negative',
            })
        } catch (err) {
            const errorMessage = (err as Error).message || 'Failed to submit feedback'
            logger.error(`CodeWhispererChat answer feedback failed: "Negative": ${errorMessage}`)

            telemetry.feedback_result.emit({ result: 'Failed' })

            return errorMessage
        }

        logger.info(`CodeWhispererChat answer feedback sent: "Negative"`)

        telemetry.feedback_result.emit({ result: 'Succeeded' })
    }
}
