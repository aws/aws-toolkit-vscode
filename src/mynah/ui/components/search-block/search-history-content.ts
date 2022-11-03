/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodeQuery } from '../../../models/model'
import { ExtendedHTMLElement } from '../../helper/dom'
import { SearchPayloadMatchPolicy, Suggestion, SearchPayloadCodeSelection } from '../../helper/static'
import { Overlay, OverlayHorizontalDirection, OverlayVerticalDirection } from '../overlay/overlay'
import { HistoryCardContent } from './search-history-card'

export interface SearchHistoryItem {
    query: {
        input: string
        queryContext: SearchPayloadMatchPolicy
        queryId?: string
        trigger: string
        codeQuery: CodeQuery
        codeSelection: SearchPayloadCodeSelection
    }
    recordDate?: number
    suggestions: Suggestion[]
}

export interface HistoryContentProps {
    referenceElement: Element | ExtendedHTMLElement
    searchHistory: SearchHistoryItem[]
    onHistoryChange: (historyItem: SearchHistoryItem) => void
}
export class HistoryContent {
    private historyItemsOverlay!: Overlay
    private readonly props: HistoryContentProps
    render!: ExtendedHTMLElement
    constructor(props: HistoryContentProps) {
        this.props = props
    }

    public createOverlay(): void {
        this.historyItemsOverlay = new Overlay({
            referenceElement: this.props.referenceElement,
            verticalDirection: OverlayVerticalDirection.TO_BOTTOM,
            horizontalDirection: OverlayHorizontalDirection.END_TO_LEFT,
            children: [
                {
                    type: 'div',
                    classNames: ['mynah-search-history-items-wrapper'],
                    children: this.searchHistoryCards(this.props.searchHistory),
                },
            ],
        })
    }

    searchHistoryCards = (historyItems: SearchHistoryItem[]): ExtendedHTMLElement[] =>
        historyItems.map(
            record =>
                new HistoryCardContent({
                    content: record,
                    onHistoryItemClick: this.handleHistoryChange.bind(this),
                }).render
        )

    private readonly handleHistoryChange = (historyItem: SearchHistoryItem): void => {
        this.historyItemsOverlay.close()
        this.props.onHistoryChange(historyItem)
    }
}
