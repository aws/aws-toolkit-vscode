/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SearchHistoryFilters, SearchHistoryRecord, SearchHistoryStore } from '../stores/searchHistoryStore'
import { Panel, PanelStore } from '../stores/panelStore'
import { telemetry } from '../../shared/telemetry/telemetry'
export interface SearchHistoryQuery {
    filters: SearchHistoryFilters
    panelId: string
}

export interface SearchHistoryListDisplayProps {
    searchHistoryStore: SearchHistoryStore
    panelStore: PanelStore
}

export class SearchHistoryDisplay {
    private readonly searchHistoryStore: SearchHistoryStore
    private readonly panelStore: PanelStore

    constructor(props: SearchHistoryListDisplayProps) {
        this.panelStore = props.panelStore
        this.searchHistoryStore = props.searchHistoryStore
    }

    private async updateContent(panel: Panel, searchHistoryRecords?: SearchHistoryRecord[] | string): Promise<void> {
        await panel.webviewPanel.webview.postMessage(
            JSON.stringify({
                sender: 'mynah',
                searchHistoryRecords,
            })
        )
    }

    public async showSearchHistoryList(query: SearchHistoryQuery): Promise<void> {
        const panelId = query.panelId
        const filters = query.filters
        const panel = this.panelStore.getPanel(panelId)
        if (panel === undefined) {
            return
        }

        try {
            const searchHistoryRecords = await this.searchHistoryStore.getHistory(filters)
            telemetry.mynah_showSearchHistory.emit()
            await this.updateContent(panel, searchHistoryRecords)
        } catch (error) {
            console.error('An error occurred when waiting for search history:', error)
            const errorHtml = '<div class="error-box">Something went wrong</div>'
            await this.updateContent(panel, errorHtml)
        }
    }
}
