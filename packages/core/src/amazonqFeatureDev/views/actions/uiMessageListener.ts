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

    /**
     * Constructs a UIMessageListener.
     * @constructor
     * @param {UIMessageListenerProps} props - The properties for initializing the UIMessageListener.
     */
    constructor(props: UIMessageListenerProps) {
        this.featureDevControllerEventsEmitters = props.chatControllerEventEmitters
        this.webViewMessageListener = props.webViewMessageListener

        // Now we are listening to events that get sent from amazonq/webview/actions/actionListener (e.g. the tab)
        this.webViewMessageListener.onMessage((msg) => {
            this.handleMessage(msg)
        })
    }

    /**
     * Handles incoming messages and routes them to the appropriate method.
     * @private
     * @param {ExtensionMessage} msg - The incoming message to be handled.
     */
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
        }
    }

    /**
     * Handles the voting action on a chat item.
     * @private
     * @param {any} msg - The message containing voting information.
     */
    private chatItemVoted(msg: any) {
        this.featureDevControllerEventsEmitters?.processChatItemVotedMessage.fire({
            tabID: msg.tabID,
            command: msg.command,
            vote: msg.vote,
            messageId: msg.messageId,
        })
    }

    private chatItemFeedback(msg: any) {
        this.featureDevControllerEventsEmitters?.processChatItemFeedbackMessage.fire(msg)
    }

    /**
     * Processes a chat message from the user.
     * @private
     * @param {any} msg - The message containing the chat information.
     */
    private processChatMessage(msg: any) {
        this.featureDevControllerEventsEmitters?.processHumanChatMessage.fire({
            message: msg.chatMessage,
            tabID: msg.tabID,
        })
    }

    /**
     * Handles the click event on a follow-up suggestion.
     * @private
     * @param {any} msg - The message containing follow-up information.
     */
    private followUpClicked(msg: any) {
        this.featureDevControllerEventsEmitters?.followUpClicked.fire({
            followUp: msg.followUp,
            tabID: msg.tabID,
        })
    }

    /**
     * Handles the click event on a file.
     * @private
     * @param {any} msg - The message containing file click information.
     */
    private fileClicked(msg: any) {
        this.featureDevControllerEventsEmitters?.fileClicked.fire({
            tabID: msg.tabID,
            filePath: msg.filePath,
            actionName: msg.actionName,
            messageId: msg.messageId,
        })
    }

    /**
     * Handles the request to open a diff view.
     * @private
     * @param {any} msg - The message containing diff information.
     */
    private openDiff(msg: any) {
        this.featureDevControllerEventsEmitters?.openDiff.fire({
            tabID: msg.tabID,
            filePath: msg.filePath,
            deleted: msg.deleted,
        })
    }

    /**
     * Handles the request to stop an ongoing response.
     * @private
     * @param {any} msg - The message containing stop response information.
     */
    private stopResponse(msg: any) {
        this.featureDevControllerEventsEmitters?.stopResponse.fire({
            tabID: msg.tabID,
        })
    }

    /**
     * Handles the event when a new tab is opened.
     * @private
     * @param {any} msg - The message containing tab opening information.
     */
    private tabOpened(msg: any) {
        this.featureDevControllerEventsEmitters?.tabOpened.fire({
            tabID: msg.tabID,
        })
    }

    /**
     * Handles the event when a tab is closed.
     * @private
     * @param {any} msg - The message containing tab closing information.
     */
    private tabClosed(msg: any) {
        this.featureDevControllerEventsEmitters?.tabClosed.fire({
            tabID: msg.tabID,
        })
    }

    /**
     * Handles the authentication click event.
     * @private
     * @param {any} msg - The message containing authentication click information.
     */
    private authClicked(msg: any) {
        this.featureDevControllerEventsEmitters?.authClicked.fire({
            tabID: msg.tabID,
            authType: msg.authType,
        })
    }

    /**
     * Processes a click event on a link in the response body.
     * @private
     * @param {any} msg - The message containing link click information.
     */
    private processResponseBodyLinkClick(msg: any) {
        this.featureDevControllerEventsEmitters?.processResponseBodyLinkClick.fire({
            command: msg.command,
            messageId: msg.messageId,
            tabID: msg.tabID,
            link: msg.link,
        })
    }

    /**
     * Handles the request to insert code at a specific position.
     * @private
     * @param {any} msg - The message containing code insertion information.
     */
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
