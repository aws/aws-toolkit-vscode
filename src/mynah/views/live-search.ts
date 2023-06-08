/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Memento } from 'vscode'
import { PanelStore } from '../stores/panelStore'

const MaxImplicitOpenCount = 1

export const LiveSearchViewCountKey = 'LIVE_SEARCH_VIEW_COUNT'

export const LiveSearchEnabledKey = 'LIVE_SEARCH_ENABLED'

export class LiveSearchDisplay {
    private liveSearchPaused = false

    constructor(readonly panelStore: PanelStore, readonly store: Memento) {}

    public async canShowLiveSearchPane(): Promise<boolean> {
        return (
            !this.liveSearchPaused &&
            (await this.isLiveSearchEnabled()) &&
            ((await this.getLiveSearchViewCount()) < MaxImplicitOpenCount || this.panelStore.isMynahPaneOpen())
        )
    }

    public pauseLiveSearch(): void {
        this.liveSearchPaused = true
    }

    public resumeLiveSearch(): void {
        this.liveSearchPaused = false
    }

    public async disableLiveSearch(): Promise<void> {
        await this.store.update(LiveSearchEnabledKey, false)
    }

    public async enableLiveSearch(): Promise<void> {
        await this.store.update(LiveSearchEnabledKey, true)
    }

    public async incrementLiveSearchViewCount(): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
        await this.store.update(LiveSearchViewCountKey, (await this.getLiveSearchViewCount()) + 1)
    }

    public isLiveSearchPaused(): boolean {
        return this.liveSearchPaused
    }

    private async isLiveSearchEnabled(): Promise<any> {
        return this.store.get(LiveSearchEnabledKey, true)
    }

    private async getLiveSearchViewCount(): Promise<any> {
        return this.store.get(LiveSearchViewCountKey, 0)
    }
}
