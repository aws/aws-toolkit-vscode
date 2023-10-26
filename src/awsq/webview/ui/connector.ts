/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItem, ChatItemFollowUp, FeedbackPayload, Suggestion, SuggestionEngagement } from '@aws/mynah-ui-chat'
import { Connector as CWChatConnector } from './apps/cwChatConnector'
import { Connector as WeaverbirdChatConnector } from './apps/weaverbirdChatConnector'
import { Connector as AwsQCommonsConnector } from './apps/awsqCommonsConnector'
import { ExtensionMessage } from './commands'
import { TabsStorage } from './storages/tabsStorage'
import { weaverbirdChat } from '../../../weaverbird/constants'
import { WelcomeFollowupType } from './apps/awsqCommonsConnector'
import { telemetry } from '../../../shared/telemetry/telemetry';

export interface ChatPayload {
    chatMessage: string
    chatCommand?: string
    attachedAPIDocsSuggestion?: Suggestion
    attachedVanillaSuggestion?: Suggestion
}

export interface ConnectorProps {
    sendMessageToExtension: (message: ExtensionMessage) => void
    onMessageReceived?: (tabID: string, messageData: any, needToShowAPIDocsTab: boolean) => void
    onChatAnswerReceived?: (tabID: string, message: ChatItem) => void
    onWelcomeFollowUpClicked: (tabID: string, welcomeFollowUpType: WelcomeFollowupType) => void
    onWriteCodeFollowUpClicked: (tabID: string, inProgress: boolean) => void
    onCWCContextCommandMessage: (message: ChatItem) => string
    onError: (tabID: string, message: string, title: string) => void
    onWarning: (tabID: string, message: string, title: string) => void
    tabsStorage: TabsStorage
}

export class Connector {
    private readonly sendMessageToExtension
    private readonly onMessageReceived
    private readonly cwChatConnector
    private readonly weaverbirdChatConnector
    private readonly tabsStorage
    private readonly awsqCommonsConnector: AwsQCommonsConnector

    private isUIReady = false

    constructor(props: ConnectorProps) {
        this.sendMessageToExtension = props.sendMessageToExtension
        this.onMessageReceived = props.onMessageReceived
        this.cwChatConnector = new CWChatConnector(props)
        this.weaverbirdChatConnector = new WeaverbirdChatConnector(props)
        this.awsqCommonsConnector = new AwsQCommonsConnector({
            onWelcomeFollowUpClicked: props.onWelcomeFollowUpClicked,
        })
        this.tabsStorage = props.tabsStorage
    }

    requestGenerativeAIAnswer = (tabID: string, payload: ChatPayload): Promise<any> =>
        new Promise((resolve, reject) => {
            if (this.isUIReady) {
                switch (this.tabsStorage.getTab(tabID)?.type) {
                    case 'wb':
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
        // TODO: how to differentiate between WB and CWSPR tab add event?
        telemetry.codewhispererchat_openChat.emit({ cwsprChatTriggerInteraction: 'click' })
        this.tabsStorage.addTab({
            id: tabID,
            type: 'unknown',
            status: 'free',
            isSelected: true,
        })
    }

    onTabChange = (tabId: string): void => {
        this.tabsStorage.setSelectedTab(tabId)
    }

    onCodeInsertToCursorPosition = (tabID: string, code?: string, type?: 'selection' | 'block'): void => {
        switch (this.tabsStorage.getTab(tabID)?.type) {
            case 'cwc':
                this.cwChatConnector.onCodeInsertToCursorPosition(tabID, code, type)
                break
            case 'wb':
                this.weaverbirdChatConnector.onCodeInsertToCursorPosition(tabID, code, type)
                break
        }
    }

    onCopyCodeToClipboard = (tabID: string, code?: string, type?: 'selection' | 'block'): void => {
        switch (this.tabsStorage.getTab(tabID)?.type) {
            case 'cwc':
                this.cwChatConnector.onCopyCodeToClipboard(tabID, code, type)
                break
            case 'wb':
                this.weaverbirdChatConnector.onCopyCodeToClipboard(tabID, code, type)
                break
        }
    }

    onTabRemove = (tabID: string): void => {
        const tab = this.tabsStorage.getTab(tabID)
        this.tabsStorage.deleteTab(tabID)
        switch (tab?.type) {
            case 'cwc':
                this.cwChatConnector.onTabRemove(tabID)
                break
            case 'wb':
                this.weaverbirdChatConnector.onTabRemove(tabID)
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

    triggerSuggestionEngagement = (tabID: string, engagement: SuggestionEngagement): void => {
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

    onFollowUpClicked = (tabID: string, followUp: ChatItemFollowUp): void => {
        switch (this.tabsStorage.getTab(tabID)?.type) {
            // TODO: We cannot rely on the tabType here,
            // It can come up at a later point depending on the future UX designs,
            // We should decide it depending on the followUp.type
            case 'unknown':
                this.awsqCommonsConnector.followUpClicked(tabID, followUp)
                break
            case 'wb':
                this.weaverbirdChatConnector.followUpClicked(tabID, followUp)
                break
            default:
                this.cwChatConnector.followUpClicked(tabID, followUp)
                break
        }
    }

    onOpenDiff = (tabID: string, leftPath: string, rightPath: string): void => {
        switch (this.tabsStorage.getTab(tabID)?.type) {
            case 'wb':
                this.weaverbirdChatConnector.onOpenDiff(tabID, leftPath, rightPath)
                break
        }
    }

    onStopChatResponse = (tabID: string): void => {
        switch (this.tabsStorage.getTab(tabID)?.type) {
            case 'wb':
                this.weaverbirdChatConnector.onStopChatResponse(tabID)
                break
            case 'cwc':
                this.cwChatConnector.onStopChatResponse(tabID)
                break
        }
    }

    sendFeedback = (tabId: string, feedbackPayload: FeedbackPayload): void | undefined => {
        switch (this.tabsStorage.getTab(tabId)?.type) {
            case 'wb':
                this.weaverbirdChatConnector.sendFeedback(tabId, feedbackPayload)
                break
        }
    }
}
