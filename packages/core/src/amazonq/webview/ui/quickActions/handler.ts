/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemType, ChatPrompt, MynahUI, NotificationType } from '@aws/mynah-ui'
import { TabDataGenerator } from '../tabs/generator'
import { Connector } from '../connector'
import { TabsStorage } from '../storages/tabsStorage'
import { uiComponentsTexts } from '../texts/constants'

export interface QuickActionsHandlerProps {
    mynahUI: MynahUI
    connector: Connector
    tabsStorage: TabsStorage
    isFeatureDevEnabled: boolean
    isGumbyEnabled: boolean
}

export class QuickActionHandler {
    private mynahUI: MynahUI
    private connector: Connector
    private tabsStorage: TabsStorage
    private tabDataGenerator: TabDataGenerator
    private isFeatureDevEnabled: boolean
    private isGumbyEnabled: boolean

    constructor(props: QuickActionsHandlerProps) {
        this.mynahUI = props.mynahUI
        this.connector = props.connector
        this.tabsStorage = props.tabsStorage
        this.tabDataGenerator = new TabDataGenerator({
            isFeatureDevEnabled: props.isFeatureDevEnabled,
            isGumbyEnabled: props.isGumbyEnabled,
        })
        this.isFeatureDevEnabled = props.isFeatureDevEnabled
        this.isGumbyEnabled = props.isGumbyEnabled
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
                this.handleGumbyCommand(tabID, eventId)
                break
            case '/clear':
                this.handleClearCommand(tabID)
                break
        }
    }

    private handleGumbyCommand(tabID: string, eventId: string | undefined) {
        if (!this.isGumbyEnabled) {
            return
        }

        let gumbyTabId: string | undefined = undefined

        this.tabsStorage.getTabs().forEach(tab => {
            if (tab.type === 'gumby') {
                gumbyTabId = tab.id
            }
        })

        if (gumbyTabId !== undefined) {
            this.mynahUI.selectTab(gumbyTabId, eventId || '')
            this.connector.onTabChange(gumbyTabId)
            return
        }

        let affectedTabId: string | undefined = tabID
        // if there is no gumby tab, open a new one
        if (this.tabsStorage.getTab(affectedTabId)?.type !== 'unknown') {
            affectedTabId = this.mynahUI.updateStore('', {
                loadingChat: true,
                promptInputDisabledState: true,
            })
        }

        if (affectedTabId === undefined) {
            this.mynahUI.notify({
                content: uiComponentsTexts.noMoreTabsTooltip,
                type: NotificationType.WARNING,
            })
            return
        } else {
            this.tabsStorage.updateTabTypeFromUnknown(affectedTabId, 'gumby')
            this.connector.onKnownTabOpen(affectedTabId)
            this.connector.onUpdateTabType(affectedTabId)

            // reset chat history
            this.mynahUI.updateStore(affectedTabId, {
                chatItems: [],
            })

            this.mynahUI.updateStore(
                affectedTabId,
                this.tabDataGenerator.getTabData('gumby', true, false, undefined, true)
            )

            // disable chat prompt
            this.mynahUI.updateStore(affectedTabId, {
                loadingChat: true,
                promptInputDisabledState: true,
            })

            this.connector.transform(affectedTabId)
        }
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
                this.tabDataGenerator.getTabData('featuredev', realPromptText === '', false, taskName)
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

                void this.connector.requestGenerativeAIAnswer(affectedTabId, {
                    chatMessage: realPromptText,
                })
            }
        }
    }
}
