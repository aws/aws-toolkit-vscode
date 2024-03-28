/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItem, ChatItemType, MynahUI, NotificationType } from '@aws/mynah-ui-chat'
import { Connector } from '../connector'
import { TabType, TabsStorage } from '../storages/tabsStorage'
import { TabDataGenerator } from '../tabs/generator'
import { uiComponentsTexts } from '../texts/constants'

export interface MessageControllerProps {
    mynahUI: MynahUI
    connector: Connector
    tabsStorage: TabsStorage
    isFeatureDevEnabled: boolean
    isCodeTransformEnabled: boolean
}

export class MessageController {
    private mynahUI: MynahUI
    private connector: Connector
    private tabsStorage: TabsStorage
    private tabDataGenerator: TabDataGenerator

    constructor(props: MessageControllerProps) {
        this.mynahUI = props.mynahUI
        this.connector = props.connector
        this.tabsStorage = props.tabsStorage
        this.tabDataGenerator = new TabDataGenerator({
            isFeatureDevEnabled: props.isFeatureDevEnabled,
            isCodeTransformEnabled: props.isCodeTransformEnabled,
        })
    }

    public sendSelectedCodeToTab(message: ChatItem): string | undefined {
        const selectedTab = { ...this.tabsStorage.getSelectedTab() }
        if (selectedTab?.id === undefined || selectedTab?.type === 'featuredev') {
            // Create a new tab if there's none
            const newTabID: string | undefined = this.mynahUI.updateStore(
                '',
                this.tabDataGenerator.getTabData('cwc', false)
            )
            if (newTabID === undefined) {
                this.mynahUI.notify({
                    content: uiComponentsTexts.noMoreTabsTooltip,
                    type: NotificationType.WARNING,
                })
                return undefined
            }
            this.tabsStorage.addTab({
                id: newTabID,
                type: 'cwc',
                status: 'free',
                isSelected: true,
            })
            selectedTab.id = newTabID
        }
        this.mynahUI.addToUserPrompt(selectedTab.id, message.body as string)

        return selectedTab.id
    }

    public sendMessageToTab(message: ChatItem, tabType: TabType): string | undefined {
        const selectedTab = this.tabsStorage.getSelectedTab()

        if (
            selectedTab !== undefined &&
            [tabType, 'unknown'].includes(selectedTab.type) &&
            selectedTab.status === 'free'
        ) {
            this.tabsStorage.updateTabStatus(selectedTab.id, 'busy')
            this.tabsStorage.updateTabTypeFromUnknown(selectedTab.id, tabType)

            this.mynahUI.updateStore(selectedTab.id, {
                loadingChat: true,
                promptInputDisabledState: true,
            })
            this.mynahUI.addChatItem(selectedTab.id, message)
            this.mynahUI.addChatItem(selectedTab.id, {
                type: ChatItemType.ANSWER_STREAM,
                body: '',
            })

            return selectedTab.id
        }

        const newTabID: string | undefined = this.mynahUI.updateStore(
            '',
            this.tabDataGenerator.getTabData('cwc', false)
        )
        if (newTabID === undefined) {
            this.mynahUI.notify({
                content: uiComponentsTexts.noMoreTabsTooltip,
                type: NotificationType.WARNING,
            })
            return undefined
        } else {
            this.mynahUI.addChatItem(newTabID, message)
            this.mynahUI.addChatItem(newTabID, {
                type: ChatItemType.ANSWER_STREAM,
                body: '',
            })

            this.mynahUI.updateStore(newTabID, {
                loadingChat: true,
                promptInputDisabledState: true,
            })

            // We have race condition here with onTabAdd Ui event. This way we need to update store twice to be sure
            this.tabsStorage.addTab({
                id: newTabID,
                type: 'cwc',
                status: 'busy',
                isSelected: true,
                openInteractionType: 'contextMenu',
            })

            this.tabsStorage.updateTabTypeFromUnknown(newTabID, 'cwc')
            this.connector.onUpdateTabType(newTabID)
            this.tabsStorage.updateTabStatus(newTabID, 'busy')

            return newTabID
        }
    }
}
