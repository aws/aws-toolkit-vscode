/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { By, WebviewView } from 'vscode-extension-tester'

export async function closeAllTabs(webview: WebviewView) {
    try {
        const closeButtons = await webview.findWebElements(By.css('.mynah-tabs-close-button'))

        for (const button of closeButtons) {
            await button.click()
            await new Promise((resolve) => setTimeout(resolve, 500))
        }

        // double check that all tabs are closed by checking if the mynah-tabs-container is empty
        const tabsContainer = await webview.findWebElements(By.css('.mynah-tabs-container'))
        if (
            tabsContainer.length === 0 ||
            (await tabsContainer[0].findElements(By.css('.mynah-tab-item-label'))).length === 0
        ) {
            console.log('All chat tabs successfully closed')
        }
    } catch (error) {
        console.log('Error closing tabs:', error)
    }
}

export async function dismissOverlayIfPresent(webview: WebviewView): Promise<boolean> {
    try {
        const overlays = await webview.findWebElements(By.css('.mynah-overlay.mynah-overlay-open'))
        if (overlays.length > 0) {
            console.log('Overlay detected, attempting to dismiss...')
            // Use JavaScript executor to click on the body element (outside the overlay)
            // This is more reliable than trying to find a specific element to click
            const driver = webview.getDriver()
            await driver.executeScript('document.body.click()')

            // Wait briefly and check if overlay is gone
            await new Promise((resolve) => setTimeout(resolve, 1000))
            const overlaysAfter = await webview.findWebElements(By.css('.mynah-overlay.mynah-overlay-open'))
            return overlaysAfter.length === 0
        }
        return true // No overlay to dismiss
    } catch (e) {
        console.log('Error while trying to dismiss overlay:', e)
        return false
    }
}
