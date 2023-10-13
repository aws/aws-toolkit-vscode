/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export type TabStatus = 'free' | 'busy'
export type TabType = 'cwc' | 'wb' | 'unknown'

export interface Tab {
    readonly id: string
    status: TabStatus
    type: TabType
    isSelected: boolean
}

export class TabsStorage {
    private tabs: Map<string, Tab> = new Map()
    private lastCreatedTabByType: Map<TabType, string> = new Map()
    private lastSelectedTab: Tab | undefined = undefined

    public addTab(tab: Tab) {
        if (this.tabs.has(tab.id)) {
            return
        }
        this.tabs.set(tab.id, tab)
        this.lastCreatedTabByType.set(tab.type, tab.id)
        if (tab.isSelected) {
            this.setSelectedTab(tab.id)
        }
    }

    public deleteTab(tabID: string) {
        this.tabs.delete(tabID)
    }

    public getTab(tabID: string): Tab | undefined {
        return this.tabs.get(tabID)
    }

    public updateTabStatus(tabID: string, tabStatus: TabStatus) {
        const currentTabValue = this.tabs.get(tabID)
        if (currentTabValue === undefined) {
            return
        }
        currentTabValue.status = tabStatus
        this.tabs.set(tabID, currentTabValue)
    }

    public updateTabTypeFromUnknown(tabID: string, tabType: TabType) {
        const currentTabValue = this.tabs.get(tabID)
        if (currentTabValue === undefined || currentTabValue.type !== 'unknown') {
            return
        }

        currentTabValue.type = tabType

        this.tabs.set(tabID, currentTabValue)
        this.lastCreatedTabByType.set(tabType, tabID)
    }

    public setSelectedTab(tabID: string) {
        const prevSelectedTab = this.lastSelectedTab
        if (prevSelectedTab !== undefined) {
            prevSelectedTab.isSelected = false
            this.tabs.set(prevSelectedTab.id, prevSelectedTab)
        }

        const newSelectedTab = this.tabs.get(tabID)
        if (newSelectedTab === undefined) {
            return
        }

        newSelectedTab.isSelected = true
        this.tabs.set(newSelectedTab.id, newSelectedTab)
        this.lastSelectedTab = newSelectedTab
    }

    public getSelectedTab(): Tab | undefined {
        return this.lastSelectedTab
    }
}
