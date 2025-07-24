/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MynahUI, NotificationType } from '@aws/mynah-ui'
import { TabDataGenerator } from '../tabs/generator'
import { uiComponentsTexts } from '../texts/constants'
import { TabType } from '../storages/tabsStorage'

/**
 * Shared utility for creating tabs in the MessageController
 */
export class TabCreationUtils {
    /**
     * Creates a new tab with error handling
     * @param mynahUI - The MynahUI instance
     * @param tabDataGenerator - The tab data generator
     * @param tabType - The type of tab to create (default: 'cwc')
     * @returns The new tab ID or undefined if creation failed
     */
    public static createNewTab(
        mynahUI: MynahUI,
        tabDataGenerator: TabDataGenerator,
        tabType: TabType = 'cwc'
    ): string | undefined {
        const newTabID: string | undefined = mynahUI.updateStore('', tabDataGenerator.getTabData(tabType, false))

        if (newTabID === undefined) {
            mynahUI.notify({
                content: uiComponentsTexts.noMoreTabsTooltip,
                type: NotificationType.WARNING,
            })
            return undefined
        }

        return newTabID
    }
}
