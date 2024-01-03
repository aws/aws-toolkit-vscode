/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemType, ChatPrompt, MynahUI } from '@aws/mynah-ui-chat'
import { Connector } from '../connector'
import { TabsStorage } from '../storages/tabsStorage'

export interface TextMessageHandlerProps {
    mynahUI: MynahUI
    connector: Connector
    tabsStorage: TabsStorage
}

export class TextMessageHandler {
    private mynahUI: MynahUI
    private connector: Connector
    private tabsStorage: TabsStorage

    constructor(props: TextMessageHandlerProps) {
        this.mynahUI = props.mynahUI
        this.connector = props.connector
        this.tabsStorage = props.tabsStorage
    }

    public handle(chatPrompt: ChatPrompt, tabID: string) {
        this.tabsStorage.updateTabTypeFromUnknown(tabID, 'cwc')
        this.tabsStorage.resetTabTimer(tabID)
        this.connector.onUpdateTabType(tabID)
        this.mynahUI.addChatItem(tabID, {
            type: ChatItemType.PROMPT,
            body: chatPrompt.escapedPrompt,
            ...(chatPrompt.attachment !== undefined
                ? {
                      relatedContent: {
                          content: [chatPrompt.attachment],
                      },
                  }
                : {}),
        })

        this.mynahUI.updateStore(tabID, {
            loadingChat: true,
            promptInputDisabledState: true,
        })

        this.tabsStorage.updateTabStatus(tabID, 'busy')

        void this.connector
            .requestGenerativeAIAnswer(tabID, {
                chatMessage: chatPrompt.prompt ?? '',
                chatCommand: chatPrompt.command,
            })
            .then(() => {})
    }
}
