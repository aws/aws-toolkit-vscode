/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { By, WebviewView } from 'vscode-extension-tester'
import { sleep } from './generalHelper'

/**
 * Closes all open chat tabs
 * @param webview The WebviewView instance
 * @returns Promise<boolean> True if all tabs were successfully closed
 * @throws Error if tabs could not be closed
 */
export async function closeAllTabs(webview: WebviewView): Promise<boolean> {
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

/**
 * Attempts to dismiss any open overlays
 * @param webview The WebviewView instance
 * @returns Promise<boolean> True if overlay was dismissed or none was present, false if dismissal failed
 */
export async function dismissOverlayIfPresent(webview: WebviewView): Promise<boolean> {
    try {
        const overlays = await webview.findWebElements(By.css('.mynah-overlay.mynah-overlay-open'))
        if (overlays.length > 0) {
            console.log('Overlay detected, attempting to dismiss...')
            const driver = webview.getDriver()
            await driver.executeScript('document.body.click()')

            await sleep(1000)
            const overlaysAfter = await webview.findWebElements(By.css('.mynah-overlay.mynah-overlay-open'))
            return overlaysAfter.length === 0
        }
        return true
    } catch (e) {
        console.log('Error while trying to dismiss overlay:', e)
        return false
    }
}
