/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItem, ChatItemAction, ChatItemType, ChatPrompt } from '@aws/mynah-ui'
import { ExtensionMessage } from '../commands'
import { AuthFollowUpType } from '../followUps/generator'
import { getTabCommandFromTabType, isTabType, TabType } from '../storages/tabsStorage'
import {
    docUserGuide,
    userGuideURL as featureDevUserGuide,
    helpMessage,
    reviewGuideUrl,
    testGuideUrl,
} from '../texts/constants'
import { linkToDocsHome } from '../../../../codewhisperer/models/constants'
import { createClickTelemetry, createOpenAgentTelemetry } from '../telemetry/actions'

export type WelcomeFollowupType = 'continue-to-chat'

export interface ConnectorProps {
    sendMessageToExtension: (message: ExtensionMessage) => void
    onWelcomeFollowUpClicked: (tabID: string, welcomeFollowUpType: WelcomeFollowupType) => void
    onNewTab: (tabType: TabType) => void
    handleCommand: (chatPrompt: ChatPrompt, tabId: string) => void
    sendStaticMessages: (tabID: string, messages: ChatItem[]) => void
}
export interface CodeReference {
    licenseName?: string
    repository?: string
    url?: string
    recommendationContentSpan?: {
        start?: number
        end?: number
    }
}

export class Connector {
    private readonly sendMessageToExtension
    private readonly onWelcomeFollowUpClicked
    private readonly onNewTab
    private readonly handleCommand
    private readonly sendStaticMessage

    constructor(props: ConnectorProps) {
        this.sendMessageToExtension = props.sendMessageToExtension
        this.onWelcomeFollowUpClicked = props.onWelcomeFollowUpClicked
        this.onNewTab = props.onNewTab
        this.handleCommand = props.handleCommand
        this.sendStaticMessage = props.sendStaticMessages
    }

    followUpClicked = (tabID: string, followUp: ChatItemAction): void => {
        if (followUp.type !== undefined && followUp.type === 'continue-to-chat') {
            this.onWelcomeFollowUpClicked(tabID, followUp.type)
        }
    }

    authFollowUpClicked = (tabID: string, tabType: string, authType: AuthFollowUpType): void => {
        this.sendMessageToExtension({
            command: 'auth-follow-up-was-clicked',
            authType,
            tabID,
            tabType,
        })
    }

    handleMessageReceive = async (messageData: any): Promise<void> => {
        if (messageData.command === 'showExploreAgentsView') {
            this.onNewTab('agentWalkthrough')
            return
        } else if (messageData.command === 'review') {
            this.onNewTab('review')
            return
        }
    }

    onCustomFormAction(
        tabId: string,
        action: {
            id: string
            text?: string | undefined
            formItemValues?: Record<string, string> | undefined
        }
    ) {
        const tabType = action.id.split('-')[2]
        if (!isTabType(tabType)) {
            return
        }

        if (action.id.startsWith('user-guide-')) {
            this.processUserGuideLink(tabType, action.id)
            return
        }

        if (action.id.startsWith('quick-start-')) {
            this.handleCommand(
                {
                    command: getTabCommandFromTabType(tabType),
                },
                tabId
            )

            this.sendMessageToExtension(createOpenAgentTelemetry(tabType, 'quick-start'))
        }
    }

    private processUserGuideLink(tabType: TabType, actionId: string) {
        let userGuideLink = ''
        switch (tabType) {
            case 'featuredev':
                userGuideLink = featureDevUserGuide
                break
            case 'testgen':
                userGuideLink = testGuideUrl
                break
            case 'review':
                userGuideLink = reviewGuideUrl
                break
            case 'doc':
                userGuideLink = docUserGuide
                break
            case 'gumby':
                userGuideLink = linkToDocsHome
                break
        }

        // e.g. amazonq-explore-user-guide-featuredev
        this.sendMessageToExtension(createClickTelemetry(`amazonq-explore-${actionId}`))

        this.sendMessageToExtension({
            command: 'open-link',
            link: userGuideLink,
        })
    }

    sendMessage(tabID: string, message: 'help') {
        switch (message) {
            case 'help':
                this.sendStaticMessage(tabID, [
                    {
                        type: ChatItemType.PROMPT,
                        body: 'How can Amazon Q help me?',
                    },
                    {
                        type: ChatItemType.ANSWER,
                        body: helpMessage,
                    },
                ])
                break
        }
    }
}
