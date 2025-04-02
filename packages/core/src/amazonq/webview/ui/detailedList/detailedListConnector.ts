/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DetailedListItem, ChatItemButton, DetailedList } from '@aws/mynah-ui'
import { ExtensionMessage } from '../commands'
import { DetailedListSheetProps } from '@aws/mynah-ui/dist/components/detailed-list/detailed-list-sheet'

export enum DetailedListType {
    history = 'history',
}
export class DetailedListConnector {
    type: DetailedListType
    sendMessageToExtension: (message: ExtensionMessage) => void
    onOpenDetailedList: (data: DetailedListSheetProps) => {
        update: (data: DetailedList) => void
        close: () => void
        changeTarget: (direction: 'up' | 'down', snapOnLastAndFirst?: boolean) => void
        getTargetElementId: () => string | undefined
    }
    closeList() {}
    updateList(_data: DetailedList) {}
    changeTarget(_direction: 'up' | 'down', _snapOnLastAndFirst?: boolean) {}
    getTargetElementId(): string | undefined {
        return undefined
    }

    constructor(
        type: DetailedListType,
        sendMessageToExtension: (message: ExtensionMessage) => void,
        onOpenDetailedList: (data: DetailedListSheetProps) => {
            update: (data: DetailedList) => void
            close: () => void
            changeTarget: (direction: 'up' | 'down', snapOnLastAndFirst?: boolean) => void
            getTargetElementId: () => string | undefined
        }
    ) {
        this.type = type
        this.sendMessageToExtension = sendMessageToExtension
        this.onOpenDetailedList = onOpenDetailedList
    }

    openList(messageData: any) {
        const { update, close, changeTarget, getTargetElementId } = this.onOpenDetailedList({
            tabId: messageData.tabID,
            detailedList: messageData.detailedList,
            events: {
                onFilterValueChange: this.onFilterValueChange,
                onKeyPress: this.onKeyPress,
                onItemSelect: this.onItemSelect,
                onActionClick: this.onActionClick,
            },
        })
        this.closeList = close
        this.updateList = update
        this.changeTarget = changeTarget
        this.getTargetElementId = getTargetElementId
    }

    onFilterValueChange = (filterValues: Record<string, any>, isValid: boolean) => {
        this.sendMessageToExtension({
            command: 'detailed-list-filter-change',
            tabType: 'cwc',
            listType: this.type,
            filterValues,
            isValid,
        })
    }

    onItemSelect = (detailedListItem: DetailedListItem) => {
        this.sendMessageToExtension({
            command: 'detailed-list-item-select',
            tabType: 'cwc',
            listType: this.type,
            item: detailedListItem,
        })
    }

    onActionClick = (action: ChatItemButton) => {
        this.sendMessageToExtension({
            command: 'detailed-list-action-click',
            tabType: 'cwc',
            listType: this.type,
            action,
        })
    }

    onKeyPress = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            this.closeList()
        } else if (e.key === 'Enter') {
            const targetElementId = this.getTargetElementId()
            if (targetElementId) {
                this.onItemSelect({
                    id: targetElementId,
                })
            }
        } else if (e.key === 'ArrowUp') {
            this.changeTarget('up')
        } else if (e.key === 'ArrowDown') {
            this.changeTarget('down')
        }
    }
}
