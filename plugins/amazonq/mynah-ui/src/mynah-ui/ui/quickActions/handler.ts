/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemType, ChatPrompt, MynahUI, NotificationType } from '@aws/mynah-ui-chat'
import { TabDataGenerator } from '../tabs/generator'
import { Connector } from '../connector'
import { Tab, TabsStorage } from '../storages/tabsStorage'
import { uiComponentsTexts } from '../texts/constants'

export interface QuickActionsHandlerProps {
    mynahUI: MynahUI
    connector: Connector
    tabsStorage: TabsStorage
    isFeatureDevEnabled: boolean
    isCodeTransformEnabled: boolean
}

export class QuickActionHandler {
    private mynahUI: MynahUI
    private connector: Connector
    private tabsStorage: TabsStorage
    private tabDataGenerator: TabDataGenerator
    public isFeatureDevEnabled: boolean
    public isCodeTransformEnabled: boolean

    constructor(props: QuickActionsHandlerProps) {
        this.mynahUI = props.mynahUI
        this.connector = props.connector
        this.tabsStorage = props.tabsStorage
        this.tabDataGenerator = new TabDataGenerator({
            isFeatureDevEnabled: props.isFeatureDevEnabled,
            isCodeTransformEnabled: props.isCodeTransformEnabled,
        })
        this.isFeatureDevEnabled = props.isFeatureDevEnabled
        this.isCodeTransformEnabled = props.isCodeTransformEnabled
    }

    public handle(chatPrompt: ChatPrompt, tabID: string, eventId?: string) {
        this.tabsStorage.resetTabTimer(tabID)
        switch (chatPrompt.command) {
            case '/dev':
                this.handleFeatureDevCommand(chatPrompt, tabID, 'Q - Dev')
                break
            case '/help':
                this.handleHelpCommand(tabID)
                break
            case '/transform':
                this.handleCodeTransformCommand(tabID, eventId)
                break
            case '/clear':
                this.handleClearCommand(tabID)
                break
        }
    }

    private handleCodeTransformCommand(tabID: string, eventId?: string) {
        if (!this.isCodeTransformEnabled) {
            return
        }

        // Check for existing opened transform tab
        const existingTransformTab = this.tabsStorage.getTabs().find((tab) => tab.type === 'codetransform')
        if (existingTransformTab !== undefined) {
            this.mynahUI.selectTab(existingTransformTab.id, eventId || "")
            this.connector.onTabChange(existingTransformTab.id)

            this.mynahUI.notify({
                title: "Q - Transform",
                content: "Switched to the opened transformation tab",
            });
            return
        }

        // Add new tab
        let affectedTabId: string | undefined = tabID
        if (this.tabsStorage.getTab(affectedTabId)?.type !== 'unknown') {
            affectedTabId = this.mynahUI.updateStore('', {})
        }
        if (affectedTabId === undefined) {
            this.mynahUI.notify({
                content: uiComponentsTexts.noMoreTabsTooltip,
                type: NotificationType.WARNING,
            })
            return
        } else {
            this.tabsStorage.updateTabTypeFromUnknown(affectedTabId, 'codetransform')
            this.connector.onKnownTabOpen(affectedTabId)
            // Clear unknown tab type's welcome message
            this.mynahUI.updateStore(affectedTabId, {chatItems: []})
            this.mynahUI.updateStore(affectedTabId, this.tabDataGenerator.getTabData('codetransform', true))
            this.mynahUI.updateStore(affectedTabId, {
                promptInputDisabledState: true,
                promptInputPlaceholder: 'Open a new tab to chat with Q.',
                loadingChat: true,
            })

            this.connector.onTabAdd(affectedTabId)
        }

        this.connector.transform(affectedTabId)
    }

    private handleClearCommand(tabID: string) {
        this.mynahUI.updateStore(tabID, {
            chatItems: [],
        })
        this.connector.clearChat(tabID)
    }

    private handleHelpCommand(tabID: string) {
        // User entered help action, so change the tab type to 'cwc' if it's an unknown tab
        if (this.tabsStorage.getTab(tabID)?.type === 'unknown') {
            this.tabsStorage.updateTabTypeFromUnknown(tabID, 'cwc')
        }

        this.connector.help(tabID)
    }

    private handleFeatureDevCommand(chatPrompt: ChatPrompt, tabID: string, taskName: string) {
        if (!this.isFeatureDevEnabled) {
            return
        }

        let affectedTabId: string | undefined = tabID
        const realPromptText = chatPrompt.escapedPrompt?.trim() ?? ''
        if (this.tabsStorage.getTab(affectedTabId)?.type !== 'unknown') {
            affectedTabId = this.mynahUI.updateStore('', {})
        }
        if (affectedTabId === undefined) {
            this.mynahUI.notify({
                content: uiComponentsTexts.noMoreTabsTooltip,
                type: NotificationType.WARNING,
            })
            return
        } else {
            this.tabsStorage.updateTabTypeFromUnknown(affectedTabId, 'featuredev')
            this.connector.onKnownTabOpen(affectedTabId)
            this.connector.onUpdateTabType(affectedTabId)

            this.mynahUI.updateStore(affectedTabId, { chatItems: [] })
            this.mynahUI.updateStore(
                affectedTabId,
                this.tabDataGenerator.getTabData('featuredev', realPromptText === '', taskName)
            )

            if (realPromptText !== '') {
                this.mynahUI.addChatItem(affectedTabId, {
                    type: ChatItemType.PROMPT,
                    body: realPromptText,
                })

                this.mynahUI.addChatItem(affectedTabId, {
                    type: ChatItemType.ANSWER_STREAM,
                    body: '',
                })

                this.mynahUI.updateStore(affectedTabId, {
                    loadingChat: true,
                    promptInputDisabledState: true,
                })

                this.connector.requestGenerativeAIAnswer(affectedTabId, {
                    chatMessage: realPromptText,
                })
            }
        }
    }
}
