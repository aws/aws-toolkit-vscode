/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemType, ChatPrompt, MynahUI } from '@aws/mynah-ui'
import { Connector } from '../connector'
import { TabsStorage } from '../storages/tabsStorage'
import { MynahUIRef } from '../../../commons/types'

export interface TextMessageHandlerProps {
    mynahUIRef: MynahUIRef
    connector: Connector
    tabsStorage: TabsStorage
}

export class TextMessageHandler {
    private mynahUIRef: MynahUIRef
    private connector: Connector
    private tabsStorage: TabsStorage

    constructor(props: TextMessageHandlerProps) {
        this.mynahUIRef = props.mynahUIRef
        this.connector = props.connector
        this.tabsStorage = props.tabsStorage
    }

    public handle(chatPrompt: ChatPrompt, tabID: string, eventID: string) {
        this.tabsStorage.updateTabLastCommand(tabID, chatPrompt.command)
        this.tabsStorage.updateTabTypeFromUnknown(tabID, 'cwc')
        this.tabsStorage.resetTabTimer(tabID)
        this.connector.onUpdateTabType(tabID)
        if (!this.mynahUI) {
            return
        }

        this.mynahUI.addChatItem(tabID, {
            type: ChatItemType.PROMPT,
            body: chatPrompt.escapedPrompt,
        })

        this.mynahUI.updateStore(tabID, {
            loadingChat: true,
            cancelButtonWhenLoading: false,
            promptInputDisabledState: true,
        })

        this.tabsStorage.updateTabStatus(tabID, 'busy')

        void this.connector
            .requestGenerativeAIAnswer(tabID, eventID, {
                chatMessage: chatPrompt.prompt ?? '',
                chatCommand: chatPrompt.command,
                chatContext: chatPrompt.context,
            })
            .then(() => {})
    }

    private get mynahUI(): MynahUI | undefined {
        return this.mynahUIRef.mynahUI
    }
}
