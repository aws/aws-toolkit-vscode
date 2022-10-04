/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Memento } from 'vscode'
import { PanelStore } from '../stores/panelStore'

const MAX_IMPLICIT_OPEN_COUNT = 1

export const LIVE_SEARCH_VIEW_COUNT_KEY = 'LIVE_SEARCH_VIEW_COUNT'

export const LIVE_SEARCH_ENABLED_KEY = 'LIVE_SEARCH_ENABLED'

export class LiveSearchDisplay {
    private liveSearchPaused = false

    constructor(readonly panelStore: PanelStore, readonly store: Memento) {}

    public async canShowLiveSearchPane(): Promise<boolean> {
        return (
            !this.liveSearchPaused &&
            (await this.isLiveSearchEnabled()) &&
            ((await this.getLiveSearchViewCount()) < MAX_IMPLICIT_OPEN_COUNT || this.panelStore.isMynahPaneOpen())
        )
    }

    public pauseLiveSearch(): void {
        this.liveSearchPaused = true
    }

    public resumeLiveSearch(): void {
        this.liveSearchPaused = false
    }

    public async disableLiveSearch(): Promise<void> {
        await this.store.update(LIVE_SEARCH_ENABLED_KEY, false)
    }

    public async enableLiveSearch(): Promise<void> {
        await this.store.update(LIVE_SEARCH_ENABLED_KEY, true)
    }

    public async incrementLiveSearchViewCount(): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
        await this.store.update(LIVE_SEARCH_VIEW_COUNT_KEY, (await this.getLiveSearchViewCount()) + 1)
    }

    public isLiveSearchPaused(): boolean {
        return this.liveSearchPaused
    }

    private async isLiveSearchEnabled(): Promise<any> {
        return this.store.get(LIVE_SEARCH_ENABLED_KEY, true)
    }

    private async getLiveSearchViewCount(): Promise<any> {
        return this.store.get(LIVE_SEARCH_VIEW_COUNT_KEY, 0)
    }
}
