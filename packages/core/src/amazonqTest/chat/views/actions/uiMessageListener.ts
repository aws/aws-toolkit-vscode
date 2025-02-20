/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageListener } from '../../../../amazonq/messages/messageListener'
import { ExtensionMessage } from '../../../../amazonq/webview/ui/commands'
import { TestChatControllerEventEmitters } from '../../controller/controller'

type UIMessage = ExtensionMessage & {
    tabID?: string
}

export interface UIMessageListenerProps {
    readonly chatControllerEventEmitters: TestChatControllerEventEmitters
    readonly webViewMessageListener: MessageListener<any>
}

export class UIMessageListener {
    private testControllerEventsEmitters: TestChatControllerEventEmitters | undefined
    private webViewMessageListener: MessageListener<any>

    constructor(props: UIMessageListenerProps) {
        this.testControllerEventsEmitters = props.chatControllerEventEmitters
        this.webViewMessageListener = props.webViewMessageListener

        // Now we are listening to events that get sent from amazonq/webview/actions/actionListener (e.g. the tab)
        this.webViewMessageListener.onMessage((msg) => {
            this.handleMessage(msg)
        })
    }

    private handleMessage(msg: ExtensionMessage) {
        switch (msg.command) {
            case 'new-tab-was-created':
                this.tabOpened(msg)
                break
            case 'tab-was-removed':
                this.tabClosed(msg)
                break
            case 'auth-follow-up-was-clicked':
                this.authClicked(msg)
                break
            case 'start-test-gen':
                this.startTestGen(msg)
                break
            case 'chat-prompt':
                this.processChatPrompt(msg)
                break
            case 'form-action-click':
                this.formActionClicked(msg)
                break
            case 'follow-up-was-clicked':
                this.followUpClicked(msg)
                break
            case 'open-diff':
                this.openDiff(msg)
                break
            case 'insert_code_at_cursor_position':
                this.insertCodeAtCursorPosition(msg)
                break
            case 'response-body-link-click':
                this.processResponseBodyLinkClick(msg)
                break
            case 'chat-item-voted':
                this.chatItemVoted(msg)
                break
            case 'chat-item-feedback':
                this.chatItemFeedback(msg)
                break
        }
    }

    private tabOpened(msg: UIMessage) {
        this.testControllerEventsEmitters?.tabOpened.fire({
            tabID: msg.tabID,
        })
    }

    private tabClosed(msg: UIMessage) {
        this.testControllerEventsEmitters?.tabClosed.fire({
            tabID: msg.tabID,
        })
    }

    private authClicked(msg: UIMessage) {
        this.testControllerEventsEmitters?.authClicked.fire({
            tabID: msg.tabID,
            authType: msg.authType,
        })
    }

    private startTestGen(msg: UIMessage) {
        this.testControllerEventsEmitters?.startTestGen.fire({
            tabID: msg.tabID,
            prompt: msg.prompt,
        })
    }

    // Takes user input from chat input box.
    private processChatPrompt(msg: UIMessage) {
        this.testControllerEventsEmitters?.processHumanChatMessage.fire({
            prompt: msg.chatMessage,
            tabID: msg.tabID,
        })
    }

    private formActionClicked(msg: UIMessage) {
        this.testControllerEventsEmitters?.formActionClicked.fire({
            ...msg,
        })
    }

    private followUpClicked(msg: any) {
        this.testControllerEventsEmitters?.followUpClicked.fire({
            followUp: msg.followUp,
            tabID: msg.tabID,
        })
    }

    private openDiff(msg: any) {
        this.testControllerEventsEmitters?.openDiff.fire({
            tabID: msg.tabID,
            filePath: msg.filePath,
            deleted: msg.deleted,
            messageId: msg.messageId,
        })
    }

    private insertCodeAtCursorPosition(msg: any) {
        this.testControllerEventsEmitters?.insertCodeAtCursorPosition.fire({
            command: msg.command,
            messageId: msg.messageId,
            tabID: msg.tabID,
            code: msg.code,
            insertionTargetType: msg.insertionTargetType,
            codeReference: msg.codeReference,
        })
    }

    private processResponseBodyLinkClick(msg: UIMessage) {
        this.testControllerEventsEmitters?.processResponseBodyLinkClick.fire({
            command: msg.command,
            messageId: msg.messageId,
            tabID: msg.tabID,
            link: msg.link,
        })
    }

    private chatItemVoted(msg: any) {
        this.testControllerEventsEmitters?.processChatItemVotedMessage.fire({
            tabID: msg.tabID,
            command: msg.command,
            vote: msg.vote,
        })
    }

    private chatItemFeedback(msg: any) {
        this.testControllerEventsEmitters?.processChatItemFeedbackMessage.fire(msg)
    }
}
