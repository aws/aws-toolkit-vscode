/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemType, ChatPrompt, MynahUI } from '@aws/mynah-ui-chat'
import { TabDataGenerator } from '../tabs/generator'
import { Connector } from '../connector'
import { TabsStorage } from '../storages/tabsStorage'

export interface QuickActionsHandlerProps {
    mynahUI: MynahUI
    connector: Connector
    tabsStorage: TabsStorage
    isWeaverbirdEnabled: boolean
}

export class QuickActionHandler {
    private mynahUI: MynahUI
    private connector: Connector
    private tabsStorage: TabsStorage
    private tabDataGenerator: TabDataGenerator
    private isWeaverbirdEnabled: boolean

    constructor(props: QuickActionsHandlerProps) {
        this.mynahUI = props.mynahUI
        this.connector = props.connector
        this.tabsStorage = props.tabsStorage
        this.tabDataGenerator = new TabDataGenerator({ isWeaverbirdEnabled: props.isWeaverbirdEnabled })
        this.isWeaverbirdEnabled = props.isWeaverbirdEnabled
    }

    public handle(chatPrompt: ChatPrompt, tabID: string) {
        switch (chatPrompt.command) {
            case '/dev':
                this.handleDevCommand(chatPrompt, tabID)
                break
            case '/clear':
                this.handleClearCommand(tabID)
                break
        }
    }

    private handleClearCommand(tabID: string) {
        this.mynahUI.updateStore(tabID, {
            chatItems: [],
        })
        this.connector.clearChat(tabID)
    }

    private handleDevCommand(chatPrompt: ChatPrompt, tabID: string) {
        if (!this.isWeaverbirdEnabled) {
            return
        }

        let affectedTabId = tabID
        const realPromptText = chatPrompt.escapedPrompt?.trim() ?? ''
        if (this.tabsStorage.getTab(affectedTabId)?.type !== 'unknown') {
            affectedTabId = this.mynahUI.updateStore('', {})
        }
        this.tabsStorage.updateTabTypeFromUnknown(affectedTabId, 'wb')
        this.connector.onKnownTabOpen(affectedTabId)
        this.connector.onUpdateTabType(affectedTabId)

        this.mynahUI.updateStore(affectedTabId, { chatItems: [] })
        this.mynahUI.updateStore(affectedTabId, this.tabDataGenerator.getTabData('wb', realPromptText === ''))

        if (realPromptText !== '') {
            this.mynahUI.addChatItem(affectedTabId, {
                type: ChatItemType.PROMPT,
                body: realPromptText,
                ...(chatPrompt.attachment !== undefined
                    ? {
                          relatedContent: {
                              content: [chatPrompt.attachment],
                          },
                      }
                    : {}),
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
