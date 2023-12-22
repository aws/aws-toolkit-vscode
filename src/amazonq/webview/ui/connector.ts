/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItem, ChatItemFollowUp, FeedbackPayload, Engagement } from '@aws/mynah-ui-chat'
import { Connector as CWChatConnector } from './apps/cwChatConnector'
import { Connector as FeatureDevChatConnector } from './apps/featureDevChatConnector'
import { Connector as AmazonQCommonsConnector } from './apps/amazonqCommonsConnector'
import { ExtensionMessage } from './commands'
import { TabType, TabsStorage } from './storages/tabsStorage'
import { WelcomeFollowupType } from './apps/amazonqCommonsConnector'
import { AuthFollowUpType } from './followUps/generator'

export interface CodeReference {
    licenseName?: string
    repository?: string
    url?: string
    recommendationContentSpan?: {
        start?: number
        end?: number
    }
}

export interface ChatPayload {
    chatMessage: string
    chatCommand?: string
}

export interface ConnectorProps {
    sendMessageToExtension: (message: ExtensionMessage) => void
    onMessageReceived?: (tabID: string, messageData: any, needToShowAPIDocsTab: boolean) => void
    onChatAnswerReceived?: (tabID: string, message: ChatItem) => void
    onWelcomeFollowUpClicked: (tabID: string, welcomeFollowUpType: WelcomeFollowupType) => void
    onAsyncEventProgress: (tabID: string, inProgress: boolean, message: string | undefined) => void
    onCWCContextCommandMessage: (message: ChatItem, command?: string) => string | undefined
    onCWCOnboardingPageInteractionMessage: (message: ChatItem) => string | undefined
    onError: (tabID: string, message: string, title: string) => void
    onWarning: (tabID: string, message: string, title: string) => void
    onUpdatePlaceholder: (tabID: string, newPlaceholder: string) => void
    onChatInputEnabled: (tabID: string, enabled: boolean) => void
    onUpdateAuthentication: (featureDevEnabled: boolean, authenticatingTabIDs: string[]) => void
    onNewTab: (tabType: TabType) => void
    tabsStorage: TabsStorage
}

export class Connector {
    private readonly sendMessageToExtension
    private readonly onMessageReceived
    private readonly cwChatConnector
    private readonly featureDevChatConnector
    private readonly tabsStorage
    private readonly amazonqCommonsConnector: AmazonQCommonsConnector

    private isUIReady = false

    constructor(props: ConnectorProps) {
        this.sendMessageToExtension = props.sendMessageToExtension
        this.onMessageReceived = props.onMessageReceived
        this.cwChatConnector = new CWChatConnector(props as ConnectorProps)
        this.featureDevChatConnector = new FeatureDevChatConnector(props)
        this.amazonqCommonsConnector = new AmazonQCommonsConnector({
            sendMessageToExtension: this.sendMessageToExtension,
            onWelcomeFollowUpClicked: props.onWelcomeFollowUpClicked,
        })
        this.tabsStorage = props.tabsStorage
    }

    onSourceLinkClick = (tabID: string, messageId: string, link: string): void => {
        switch (this.tabsStorage.getTab(tabID)?.type) {
            case 'cwc':
                this.cwChatConnector.onSourceLinkClick(tabID, messageId, link)
                break
        }
    }

    onResponseBodyLinkClick = (tabID: string, messageId: string, link: string): void => {
        switch (this.tabsStorage.getTab(tabID)?.type) {
            case 'cwc':
                this.cwChatConnector.onResponseBodyLinkClick(tabID, messageId, link)
                break
            case 'featuredev':
                this.featureDevChatConnector.onResponseBodyLinkClick(tabID, messageId, link)
                break
        }
    }

    onInfoLinkClick = (tabID: string, link: string): void => {
        switch (this.tabsStorage.getTab(tabID)?.type) {
            default:
                this.cwChatConnector.onInfoLinkClick(tabID, link)
                break
        }
    }

    requestGenerativeAIAnswer = (tabID: string, payload: ChatPayload): Promise<any> =>
        new Promise((resolve, reject) => {
            if (this.isUIReady) {
                switch (this.tabsStorage.getTab(tabID)?.type) {
                    case 'featuredev':
                        return this.featureDevChatConnector.requestGenerativeAIAnswer(tabID, payload)
                    default:
                        return this.cwChatConnector.requestGenerativeAIAnswer(tabID, payload)
                }
            } else {
                return setTimeout(() => {
                    return this.requestGenerativeAIAnswer(tabID, payload)
                }, 2000)
            }
        })

    clearChat = (tabID: string): void => {
        switch (this.tabsStorage.getTab(tabID)?.type) {
            case 'cwc':
                this.cwChatConnector.clearChat(tabID)
                break
        }
    }

    help = (tabID: string): void => {
        switch (this.tabsStorage.getTab(tabID)?.type) {
            case 'cwc':
                this.cwChatConnector.help(tabID)
                break
        }
    }

    transform = (tabID: string): void => {
        switch (this.tabsStorage.getTab(tabID)?.type) {
            default:
                this.cwChatConnector.transform(tabID)
                break
        }
    }

    handleMessageReceive = async (message: MessageEvent): Promise<void> => {
        if (message.data === undefined) {
            return
        }

        // TODO: potential json parsing error exists. Need to determine the failing case.
        const messageData = JSON.parse(message.data)

        if (messageData === undefined) {
            return
        }

        if (messageData.sender === 'CWChat') {
            await this.cwChatConnector.handleMessageReceive(messageData)
        } else if (messageData.sender === 'featureDevChat') {
            await this.featureDevChatConnector.handleMessageReceive(messageData)
        }
    }

    onTabAdd = (tabID: string): void => {
        this.tabsStorage.addTab({
            id: tabID,
            type: 'unknown',
            status: 'free',
            isSelected: true,
        })
    }

    onUpdateTabType = (tabID: string) => {
        const tab = this.tabsStorage.getTab(tabID)
        switch (tab?.type) {
            case 'cwc':
                this.cwChatConnector.onTabAdd(tabID, tab.openInteractionType)
                break
        }
    }

    onKnownTabOpen = (tabID: string): void => {
        switch (this.tabsStorage.getTab(tabID)?.type) {
            case 'featuredev':
                this.featureDevChatConnector.onTabOpen(tabID)
                break
        }
    }

    onTabChange = (tabId: string): void => {
        const prevTabID = this.tabsStorage.setSelectedTab(tabId)
        this.cwChatConnector.onTabChange(tabId, prevTabID)
    }

    onCodeInsertToCursorPosition = (
        tabID: string,
        messageId: string,
        code?: string,
        type?: 'selection' | 'block',
        codeReference?: CodeReference[]
    ): void => {
        switch (this.tabsStorage.getTab(tabID)?.type) {
            case 'cwc':
                this.cwChatConnector.onCodeInsertToCursorPosition(tabID, messageId, code, type, codeReference)
                break
            case 'featuredev':
                this.featureDevChatConnector.onCodeInsertToCursorPosition(tabID, code, type, codeReference)
                break
        }
    }

    onCopyCodeToClipboard = (
        tabID: string,
        messageId: string,
        code?: string,
        type?: 'selection' | 'block',
        codeReference?: CodeReference[]
    ): void => {
        switch (this.tabsStorage.getTab(tabID)?.type) {
            case 'cwc':
                this.cwChatConnector.onCopyCodeToClipboard(tabID, messageId, code, type, codeReference)
                break
            case 'featuredev':
                this.featureDevChatConnector.onCopyCodeToClipboard(tabID, code, type, codeReference)
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
            case 'featuredev':
                this.featureDevChatConnector.onTabRemove(tabID)
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

        window.addEventListener('focus', this.handleApplicationFocus)
        window.addEventListener('blur', this.handleApplicationFocus)
    }

    handleApplicationFocus = async (event: FocusEvent): Promise<void> => {
        this.sendMessageToExtension({
            command: 'ui-focus',
            type: event.type,
            tabType: 'cwc',
        })
    }

    triggerSuggestionEngagement = (tabId: string, messageId: string, engagement: Engagement): void => {
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

    onAuthFollowUpClicked = (tabID: string, authType: AuthFollowUpType) => {
        const tabType = this.tabsStorage.getTab(tabID)?.type
        switch (tabType) {
            case 'cwc':
            case 'featuredev':
                this.amazonqCommonsConnector.authFollowUpClicked(tabID, tabType, authType)
        }
    }

    onFollowUpClicked = (tabID: string, messageId: string, followUp: ChatItemFollowUp): void => {
        switch (this.tabsStorage.getTab(tabID)?.type) {
            // TODO: We cannot rely on the tabType here,
            // It can come up at a later point depending on the future UX designs,
            // We should decide it depending on the followUp.type
            case 'unknown':
                this.amazonqCommonsConnector.followUpClicked(tabID, followUp)
                break
            case 'featuredev':
                this.featureDevChatConnector.followUpClicked(tabID, followUp)
                break
            default:
                this.cwChatConnector.followUpClicked(tabID, messageId, followUp)
                break
        }
    }

    onOpenDiff = (tabID: string, filePath: string, deleted: boolean): void => {
        switch (this.tabsStorage.getTab(tabID)?.type) {
            case 'featuredev':
                this.featureDevChatConnector.onOpenDiff(tabID, filePath, deleted)
                break
        }
    }

    onStopChatResponse = (tabID: string): void => {
        switch (this.tabsStorage.getTab(tabID)?.type) {
            case 'featuredev':
                this.featureDevChatConnector.onStopChatResponse(tabID)
                break
            case 'cwc':
                this.cwChatConnector.onStopChatResponse(tabID)
                break
        }
    }

    sendFeedback = (tabId: string, feedbackPayload: FeedbackPayload): void | undefined => {
        switch (this.tabsStorage.getTab(tabId)?.type) {
            case 'featuredev':
                this.featureDevChatConnector.sendFeedback(tabId, feedbackPayload)
                break
            case 'cwc':
                this.cwChatConnector.onSendFeedback(tabId, feedbackPayload)
                break
        }
    }

    onChatItemVoted = (tabId: string, messageId: string, vote: 'upvote' | 'downvote'): void | undefined => {
        switch (this.tabsStorage.getTab(tabId)?.type) {
            case 'cwc':
                this.cwChatConnector.onChatItemVoted(tabId, messageId, vote)
                break
            case 'featuredev':
                this.featureDevChatConnector.onChatItemVoted(tabId, messageId, vote)
                break
        }
    }
}
