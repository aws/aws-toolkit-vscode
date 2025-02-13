/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageListener, ExtensionMessage } from 'aws-core-vscode/amazonq'
import { ScanChatControllerEventEmitters } from 'aws-core-vscode/amazonqScan'

type UIMessage = ExtensionMessage & {
    tabID?: string
}

export interface UIMessageListenerProps {
    readonly chatControllerEventEmitters: ScanChatControllerEventEmitters
    readonly webViewMessageListener: MessageListener<any>
}

export class UIMessageListener {
    private scanControllerEventsEmitters: ScanChatControllerEventEmitters | undefined
    private webViewMessageListener: MessageListener<any>

    constructor(props: UIMessageListenerProps) {
        this.scanControllerEventsEmitters = props.chatControllerEventEmitters
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
            case 'form-action-click':
                this.formActionClicked(msg)
                break
            case 'follow-up-was-clicked':
                this.followUpClicked(msg)
                break
            case 'response-body-link-click':
                this.processResponseBodyLinkClick(msg)
                break
            case 'file-click':
                this.processFileClick(msg)
                break
            case 'chat-item-voted':
                this.chatItemVoted(msg)
                break
        }
    }

    private formActionClicked(msg: UIMessage) {
        this.scanControllerEventsEmitters?.formActionClicked.fire({
            ...msg,
        })
    }

    private tabOpened(msg: UIMessage) {
        this.scanControllerEventsEmitters?.tabOpened.fire({
            tabID: msg.tabID,
        })
    }

    private tabClosed(msg: UIMessage) {
        this.scanControllerEventsEmitters?.tabClosed.fire({
            tabID: msg.tabID,
        })
    }

    private authClicked(msg: UIMessage) {
        this.scanControllerEventsEmitters?.authClicked.fire({
            tabID: msg.tabID,
            authType: msg.authType,
        })
    }

    private followUpClicked(msg: UIMessage) {
        this.scanControllerEventsEmitters?.followUpClicked.fire({
            followUp: msg.followUp,
            tabID: msg.tabID,
        })
    }

    private processResponseBodyLinkClick(msg: UIMessage) {
        this.scanControllerEventsEmitters?.processResponseBodyLinkClick.fire({
            command: msg.command,
            messageId: msg.messageId,
            tabID: msg.tabID,
            link: msg.link,
        })
    }

    private processFileClick(msg: UIMessage) {
        this.scanControllerEventsEmitters?.fileClicked.fire({
            tabID: msg.tabID,
            messageId: msg.messageId,
            filePath: msg.filePath,
        })
    }

    private chatItemVoted(msg: any) {
        this.scanControllerEventsEmitters?.processChatItemVotedMessage.fire({
            tabID: msg.tabID,
            command: msg.command,
            vote: msg.vote,
        })
    }
}
