/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { By, WebviewView } from 'vscode-extension-tester'
import { sleep } from './generalUtils'

/**
 * Closes all open chat tabs
 * @param webview The WebviewView instance
 * @throws Error if tabs could not be closed
 */
export async function closeAllTabs(webview: WebviewView): Promise<void> {
    try {
        const closeButtons = await webview.findWebElements(By.css('.mynah-tabs-close-button'))

        for (const button of closeButtons) {
            await button.click()
            await sleep(500)
        }

        const tabsContainer = await webview.findWebElements(By.css('.mynah-tabs-container'))
        const allClosed =
            tabsContainer.length === 1 ||
            (await tabsContainer[0].findElements(By.css('.mynah-tab-item-label'))).length === 0

        if (!allClosed) {
            throw new Error('Failed to close all tabs')
        }
    } catch (e) {
        throw new Error(`Failed to close all tabs: ${e}`)
    }
}

/**
 * Attempts to dismiss any open overlays
 * @param webview The WebviewView instance
 * @throws Error if overlay dismissal failed
 */
export async function dismissOverlayIfPresent(webview: WebviewView): Promise<void> {
    try {
        const overlays = await webview.findWebElements(By.css('.mynah-overlay.mynah-overlay-open'))
        if (overlays.length > 0) {
            const driver = webview.getDriver()
            await driver.executeScript('document.body.click()')

            await sleep(1000)
            const overlaysAfter = await webview.findWebElements(By.css('.mynah-overlay.mynah-overlay-open'))
            if (overlaysAfter.length > 0) {
                throw new Error('Failed to dismiss overlay')
            }
        }
    } catch (e) {
        throw new Error(`Failed to dismiss overlay: ${e}`)
    }
}
