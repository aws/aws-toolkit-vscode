/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemAction, ChatItemType, MynahIcons, MynahUI } from '@aws/mynah-ui'
import { Connector } from '../connector'
import { TabsStorage } from '../storages/tabsStorage'
import { WelcomeFollowupType } from '../apps/amazonqCommonsConnector'
import { AuthFollowUpType } from './generator'
import { FollowUpTypes } from '../../../commons/types'

export interface FollowUpInteractionHandlerProps {
    mynahUI: MynahUI
    connector: Connector
    tabsStorage: TabsStorage
}

export class FollowUpInteractionHandler {
    private mynahUI: MynahUI
    private connector: Connector
    private tabsStorage: TabsStorage

    constructor(props: FollowUpInteractionHandlerProps) {
        this.mynahUI = props.mynahUI
        this.connector = props.connector
        this.tabsStorage = props.tabsStorage
    }

    public onFollowUpClicked(tabID: string, messageId: string, followUp: ChatItemAction) {
        if (
            followUp.type !== undefined &&
            ['full-auth', 're-auth', 'missing_scopes', 'use-supported-auth'].includes(followUp.type)
        ) {
            this.connector.onAuthFollowUpClicked(tabID, followUp.type as AuthFollowUpType)
            return
        }
        if (followUp.type !== undefined && followUp.type === 'help') {
            this.tabsStorage.updateTabTypeFromUnknown(tabID, 'cwc')
            this.connector.onUpdateTabType(tabID)
            this.connector.help(tabID)
            return
        }
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
            this.tabsStorage.resetTabTimer(tabID)

            if (followUp.type !== undefined && followUp.type === 'init-prompt') {
                void this.connector.requestGenerativeAIAnswer(tabID, messageId, {
                    chatMessage: followUp.prompt,
                })
                return
            }
        }

        const addChatItem = (tabID: string, messageId: string, options: any[]) => {
            this.mynahUI.addChatItem(tabID, {
                type: ChatItemType.ANSWER_PART,
                messageId,
                followUp: {
                    text: '',
                    options,
                },
            })
        }

        const ViewDiffOptions = [
            {
                icon: MynahIcons.OK,
                pillText: 'Accept',
                status: 'success',
                type: FollowUpTypes.AcceptCode,
            },
            {
                icon: MynahIcons.REVERT,
                pillText: 'Reject',
                status: 'error',
                type: FollowUpTypes.RejectCode,
            },
        ]

        const AcceptCodeOptions = [
            {
                icon: MynahIcons.OK,
                pillText: 'Accepted',
                status: 'success',
                disabled: true,
            },
        ]

        const RejectCodeOptions = [
            {
                icon: MynahIcons.REVERT,
                pillText: 'Rejected',
                status: 'error',
                disabled: true,
            },
        ]

        const ViewCodeDiffAfterIterationOptions = [
            {
                icon: MynahIcons.OK,
                pillText: 'Accept',
                status: 'success',
                type: FollowUpTypes.AcceptCode,
            },
            {
                icon: MynahIcons.REVERT,
                pillText: 'Reject',
                status: 'error',
                type: FollowUpTypes.RejectCode, // TODO: Add new Followup Action for "Reject"
            },
        ]

        if (this.tabsStorage.getTab(tabID)?.type === 'testgen') {
            switch (followUp.type) {
                case FollowUpTypes.ViewDiff:
                    addChatItem(tabID, messageId, ViewDiffOptions)
                    break
                case FollowUpTypes.AcceptCode:
                    addChatItem(tabID, messageId, AcceptCodeOptions)
                    break
                case FollowUpTypes.RejectCode:
                    addChatItem(tabID, messageId, RejectCodeOptions)
                    break
                case FollowUpTypes.ViewCodeDiffAfterIteration:
                    addChatItem(tabID, messageId, ViewCodeDiffAfterIterationOptions)
                    break
            }
        }

        this.connector.onFollowUpClicked(tabID, messageId, followUp)
    }

    public onWelcomeFollowUpClicked(tabID: string, welcomeFollowUpType: WelcomeFollowupType) {
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
