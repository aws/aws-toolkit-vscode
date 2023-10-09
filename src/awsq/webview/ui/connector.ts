/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItem, Suggestion, SuggestionEngagement } from '@aws/mynah-ui-chat'
import { Connector as CWChatConnector } from './apps/cwChatConnector'

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

    private isUIReady = false

    constructor(props: ConnectorProps) {
        this.postMessageHandler = props.postMessageHandler
        this.onMessageReceived = props.onMessageReceived
        this.cwChatConnector = new CWChatConnector(props)
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
        }
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
}
