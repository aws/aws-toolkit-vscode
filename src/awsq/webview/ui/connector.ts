/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItem, ChatItemFollowUp, Suggestion, SuggestionEngagement } from '@aws/mynah-ui-chat'
import { Connector as CWChatConnector } from './apps/cwChatConnector'
import { Connector as WeaverbirdChatConnector } from './apps/weaverbirdChatConnector'
import { weaverbirdChat } from '../../../weaverbird/views/actions/uiMessageListener'
import { ExtensionMessage } from './commands'
import { TabType, TabTypeStorage } from './storages/tabTypeStorage'

interface ChatPayload {
    chatMessage: string
    attachedAPIDocsSuggestion?: Suggestion
    attachedVanillaSuggestion?: Suggestion
}

export interface ConnectorProps {
    sendMessageToExtension: (message: ExtensionMessage) => void
    onMessageReceived?: (tabID: string, messageData: any, needToShowAPIDocsTab: boolean) => void
    onChatAnswerReceived?: (tabID: string, message: ChatItem) => void
    onError: (tabID: string, message: string, title: string) => void
    onWarning: (tabID: string, message: string, title: string) => void
    tabTypeStorage: TabTypeStorage
}

export class Connector {
    private readonly sendMessageToExtension
    private readonly onMessageReceived
    private readonly cwChatConnector
    private readonly weaverbirdChatConnector
    private readonly tabTypesStorage

    private isUIReady = false

    constructor(props: ConnectorProps) {
        this.sendMessageToExtension = props.sendMessageToExtension
        this.onMessageReceived = props.onMessageReceived
        this.cwChatConnector = new CWChatConnector(props)
        this.weaverbirdChatConnector = new WeaverbirdChatConnector(props)
        this.tabTypesStorage = props.tabTypeStorage
    }

    requestGenerativeAIAnswer = (tabID: string, payload: ChatPayload): Promise<any> =>
        new Promise((resolve, reject) => {
            if (this.isUIReady) {
                switch (this.tabTypesStorage.getTabType(tabID)) {
                    case TabType.WeaverBird:
                        this.weaverbirdChatConnector.requestGenerativeAIAnswer(tabID, payload)
                        break
                    default:
                        this.cwChatConnector.requestGenerativeAIAnswer(tabID, payload)
                        break
                }
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
        const currentTabType = this.tabTypesStorage.getTabType(tabID)
        if (currentTabType === undefined) {
            this.tabTypesStorage.addTab(tabID, TabType.Unknown)
        }

        switch (currentTabType) {
            case TabType.CodeWhispererChat:
                this.cwChatConnector.onTabAdd(tabID)
                break
        }
    }

    onTabRemove = (tabID: string): void => {
        const tabType = this.tabTypesStorage.getTabType(tabID)
        this.tabTypesStorage.deleteTab(tabID)
        switch (tabType) {
            default:
                this.cwChatConnector.onTabRemove(tabID)
                break
        }
    }

    uiReady = (): void => {
        this.isUIReady = true
        this.sendMessageToExtension({
            command: 'ui-is-ready',
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
        // this.sendMessageToExtension({
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
        switch (this.tabTypesStorage.getTabType(tabID)) {
            case TabType.WeaverBird:
                this.weaverbirdChatConnector.followUpClicked(tabID, followUp)
                break
            default:
                this.cwChatConnector.followUpClicked(tabID, followUp)
                break
        }
    }

    onOpenDiff = (tabID: string, leftPath: string, rightPath: string): void => {
        switch (this.tabTypesStorage.getTabType(tabID)) {
            case TabType.WeaverBird:
                this.weaverbirdChatConnector.onOpenDiff(tabID, leftPath, rightPath)
                break
        }
    }
}
