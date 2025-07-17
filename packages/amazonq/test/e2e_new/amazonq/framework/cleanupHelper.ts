/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { By, WebviewView } from 'vscode-extension-tester'

export async function closeAllTabs(webview: WebviewView): Promise<boolean> {
    try {
        const closeButtons = await webview.findWebElements(By.css('.mynah-tabs-close-button'))

        for (const button of closeButtons) {
            await button.click()
            await new Promise((resolve) => setTimeout(resolve, 500))
        }

        const tabsContainer = await webview.findWebElements(By.css('.mynah-tabs-container'))
        const allClosed =
            tabsContainer.length === 0 ||
            (await tabsContainer[0].findElements(By.css('.mynah-tab-item-label'))).length === 0

        if (allClosed) {
            console.log('All chat tabs successfully closed')
            return true
        } else {
            throw new Error('Failed to close all tabs')
        }
    } catch (error) {
        console.error('Error closing tabs:', error)
        throw error
    }
}
