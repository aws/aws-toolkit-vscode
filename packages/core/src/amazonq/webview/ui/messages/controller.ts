/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItem, ChatItemType, MynahUI, NotificationType } from '@aws/mynah-ui'
import { Connector } from '../connector'
import { TabType, TabsStorage } from '../storages/tabsStorage'
import { TabDataGenerator } from '../tabs/generator'
import { uiComponentsTexts } from '../texts/constants'
import { MynahUIRef } from '../../../commons/types'

export interface MessageControllerProps {
    mynahUIRef: MynahUIRef
    connector: Connector
    tabsStorage: TabsStorage
    isGumbyEnabled: boolean
    isScanEnabled: boolean
    disabledCommands?: string[]
}

export class MessageController {
    private mynahUIRef: MynahUIRef
    private connector: Connector
    private tabsStorage: TabsStorage
    private tabDataGenerator: TabDataGenerator

    constructor(props: MessageControllerProps) {
        this.mynahUIRef = props.mynahUIRef
        this.connector = props.connector
        this.tabsStorage = props.tabsStorage
        this.tabDataGenerator = new TabDataGenerator({
            isGumbyEnabled: props.isGumbyEnabled,
            isScanEnabled: props.isScanEnabled,
            disabledCommands: props.disabledCommands,
        })
    }

    public sendSelectedCodeToTab(message: ChatItem, command: string = ''): string | undefined {
        const selectedTab = { ...this.tabsStorage.getSelectedTab() }
        if (!this.mynahUI) {
            return
        }

        if (
            selectedTab?.id === undefined ||
            selectedTab?.type === undefined ||
            ['featuredev', 'gumby', 'review', 'testgen', 'doc'].includes(selectedTab.type)
        ) {
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
                lastCommand: command,
            })
            selectedTab.id = newTabID
        }
        this.mynahUI.addToUserPrompt(selectedTab.id, message.body as string)

        return selectedTab.id
    }

    public sendMessageToTab(message: ChatItem, tabType: TabType, command: string = ''): string | undefined {
        const selectedTab = this.tabsStorage.getSelectedTab()
        if (!this.mynahUI) {
            return
        }

        if (
            selectedTab !== undefined &&
            [tabType, 'unknown'].includes(selectedTab.type) &&
            selectedTab.status === 'free'
        ) {
            this.tabsStorage.updateTabStatus(selectedTab.id, 'busy')
            this.tabsStorage.updateTabTypeFromUnknown(selectedTab.id, tabType)
            this.tabsStorage.updateTabLastCommand(selectedTab.id, command)

            this.mynahUI.updateStore(selectedTab.id, {
                loadingChat: true,
                cancelButtonWhenLoading: false,
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
            this.tabsStorage.updateTabLastCommand(newTabID, command)
            this.mynahUI.addChatItem(newTabID, message)
            this.mynahUI.addChatItem(newTabID, {
                type: ChatItemType.ANSWER_STREAM,
                body: '',
            })

            this.mynahUI.updateStore(newTabID, {
                loadingChat: true,
                cancelButtonWhenLoading: false,
                promptInputDisabledState: true,
            })

            // We have race condition here with onTabAdd Ui event. This way we need to update store twice to be sure
            this.tabsStorage.addTab({
                id: newTabID,
                type: 'cwc',
                status: 'busy',
                isSelected: true,
                openInteractionType: 'contextMenu',
                lastCommand: command,
            })

            this.tabsStorage.updateTabTypeFromUnknown(newTabID, 'cwc')
            this.connector.onUpdateTabType(newTabID)
            this.tabsStorage.updateTabStatus(newTabID, 'busy')

            return newTabID
        }
    }

    private get mynahUI(): MynahUI | undefined {
        return this.mynahUIRef.mynahUI
    }
}
