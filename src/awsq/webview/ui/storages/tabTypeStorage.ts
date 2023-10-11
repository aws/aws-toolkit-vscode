/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export enum TabType {
    CodeWhispererChat = 'cwc',
    WeaverBird = 'wb',
    Unknown = 'unknown',
}

export class TabTypeStorage {
    private tabs: Map<string, TabType> = new Map()

    public updateTab(tabID: string, tabType: TabType) {
        this.tabs.set(tabID, tabType)
    }

    public addTab(tabID: string, tabType: TabType) {
        if (this.tabs.has(tabID)) {
            return
        }
        this.tabs.set(tabID, tabType)
    }

    public deleteTab(tabID: string) {
        this.tabs.delete(tabID)
    }

    public getTabType(tabID: string): TabType | undefined {
        return this.tabs.get(tabID)
    }
}
