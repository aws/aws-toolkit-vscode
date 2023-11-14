/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemFollowUp, ChatItemType, MynahUI } from '@aws/mynah-ui-chat'
import { Connector } from '../connector'
import { TabsStorage } from '../storages/tabsStorage'
import { WelcomeFollowupType } from '../apps/amazonqCommonsConnector'
import { TabDataGenerator } from '../tabs/generator'

export interface FollowUpInteractionHandlerProps {
    mynahUI: MynahUI
    connector: Connector
    tabsStorage: TabsStorage
    isWeaverbirdEnabled: boolean
}

export class FollowUpInteractionHandler {
    private mynahUI: MynahUI
    private connector: Connector
    private tabsStorage: TabsStorage
    private tabDataGenerator: TabDataGenerator

    constructor(props: FollowUpInteractionHandlerProps) {
        this.mynahUI = props.mynahUI
        this.connector = props.connector
        this.tabsStorage = props.tabsStorage
        this.tabDataGenerator = new TabDataGenerator({ isWeaverbirdEnabled: props.isWeaverbirdEnabled })
    }

    public onFollowUpClicked(tabID: string, messageId: string, followUp: ChatItemFollowUp) {
        // we need to check if there is a prompt
        // which will cause an api call
        // then we can set the loading state to true
        if (followUp.prompt !== undefined) {
            this.mynahUI.updateStore(tabID, {
                loadingChat: true,
                promptInputDisabledState: true,
            })
            this.mynahUI.addChatItem(tabID, {
                type: ChatItemType.PROMPT,
                body: followUp.prompt,
            })
            this.mynahUI.addChatItem(tabID, {
                type: ChatItemType.ANSWER_STREAM,
                body: '',
            })
            this.tabsStorage.updateTabStatus(tabID, 'busy')
        }
        this.connector.onFollowUpClicked(tabID, messageId, followUp)
    }

    public onWelcomeFollowUpClicked(tabID: string, welcomeFollowUpType: WelcomeFollowupType) {
        if (welcomeFollowUpType === 'assign-code-task') {
            const newTabId = this.mynahUI.updateStore('', this.tabDataGenerator.getTabData('wb', true))
            // TODO remove this since it will be added with the onTabAdd and onTabAdd is now sync,
            // It means that it cannot trigger after the updateStore function returns.
            this.tabsStorage.addTab({
                id: newTabId,
                status: 'busy',
                type: 'unknown',
                isSelected: true,
                openInteractionType: 'click',
            })

            this.tabsStorage.updateTabTypeFromUnknown(tabID, 'cwc')
            this.connector.onUpdateTabType(tabID)
            this.tabsStorage.updateTabTypeFromUnknown(newTabId, 'wb')
            this.connector.onUpdateTabType(newTabId)

            // Let weaverbird know a wb tab has been opened
            this.connector.onKnownTabOpen(newTabId)
            return
        }

        if (welcomeFollowUpType === 'continue-to-chat') {
            this.mynahUI.addChatItem(tabID, {
                type: ChatItemType.ANSWER,
                body: 'Ok, please write your question below.',
            })
            this.tabsStorage.updateTabTypeFromUnknown(tabID, 'cwc')
            this.connector.onUpdateTabType(tabID)
            return
        }
    }
}
