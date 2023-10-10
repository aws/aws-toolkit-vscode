/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItem, ChatItemFollowUp, Suggestion, SuggestionEngagement } from '@aws/mynah-ui-chat'
import { Connector as CWChatConnector } from './apps/cwChatConnector'
import { Connector as WeaverbirdChatConnector } from './apps/weaverbirdChatConnector'
import { weaverbirdChat } from '../../../weaverbird/views/actions/uiMessageListener'

interface ChatPayload {
    chatMessage: string
    attachedAPIDocsSuggestion?: Suggestion
    attachedVanillaSuggestion?: Suggestion
}

export interface ConnectorProps {
    postMessageHandler: (message: Record<string, any>) => void
    onMessageReceived?: (tabID: string, messageData: any, needToShowAPIDocsTab: boolean) => void
    onChatAnswerReceived?: (tabID: string, message: ChatItem) => void
    onError: (tabID: string, message: string, title: string) => void
    onWarning: (tabID: string, message: string, title: string) => void
}

export class Connector {
    private readonly postMessageHandler
    private readonly onMessageReceived
    private readonly cwChatConnector
    private readonly weaverbirdChatConnector

    private isUIReady = false

    constructor(props: ConnectorProps) {
        this.postMessageHandler = props.postMessageHandler
        this.onMessageReceived = props.onMessageReceived
        this.cwChatConnector = new CWChatConnector(props)
        this.weaverbirdChatConnector = new WeaverbirdChatConnector(props)
    }

    requestGenerativeAIAnswer = (tabID: string, payload: ChatPayload): Promise<any> =>
        new Promise((resolve, reject) => {
            if (this.isUIReady) {
                this.cwChatConnector.requestGenerativeAIAnswer(tabID, payload)
            } else {
                setTimeout(() => {
                    this.requestGenerativeAIAnswer(tabID, payload)
                }, 50)
                return
            }
        })

    handleMessageReceive = async (message: MessageEvent): Promise<void> => {
        if (message.data === undefined) {
            return
        }
        const messageData = JSON.parse(message.data)

        if (messageData == undefined) {
            return
        }

        if (messageData.sender === 'CWChat') {
            this.cwChatConnector.handleMessageReceive(messageData)
        } else if (messageData.sender === weaverbirdChat) {
            this.weaverbirdChatConnector.handleMessageReceive(messageData)
        }
    }

    onTabAdd = (tabID: string): void => {
        this.postMessageHandler({
            tabID: tabID,
            command: 'newTabWasCreated',
        })
    }

    onTabRemove = (tabID: string): void => {
        this.postMessageHandler({
            tabID: tabID,
            command: 'tabWasRemoved',
        })
    }

    uiReady = (): void => {
        this.isUIReady = true
        this.postMessageHandler({
            command: 'uiReady',
        })
        if (this.onMessageReceived !== undefined) {
            window.addEventListener('message', this.handleMessageReceive.bind(this))
        }
    }

    triggerSuggestionEngagement = (engagement: SuggestionEngagement): void => {
        // let command: string = 'hoverSuggestion'
        // if (
        //     engagement.engagementType === EngagementType.INTERACTION &&
        //     engagement.selectionDistanceTraveled?.selectedText !== undefined
        // ) {
        //     command = 'selectSuggestionText'
        // }
        // this.postMessageHandler({
        //     command,
        //     searchId: this.searchId,
        //     suggestionId: engagement.suggestion.url,
        //     // suggestionRank: parseInt(engagement.suggestion.id),
        //     suggestionType: engagement.suggestion.type,
        //     selectedText: engagement.selectionDistanceTraveled?.selectedText,
        //     hoverDuration: engagement.engagementDurationTillTrigger / 1000, // seconds
        // })
    }

    followUpClicked = (tabID: string, followUp: ChatItemFollowUp): void => {
        this.postMessageHandler({
            command: 'followUpClicked',
            followUp,
            tabID,
        })
    }
}
