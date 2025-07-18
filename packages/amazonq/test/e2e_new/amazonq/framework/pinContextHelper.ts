/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { By, WebviewView } from 'vscode-extension-tester'
import { waitForElement } from './generalHelper'
import { WebElement } from 'vscode-extension-tester'

/**
 * Clicks the "Pin Context" button in the chat interface
 * @param webview The WebviewView instance
 * @returns Promise<boolean> True if button was found and clicked, false otherwise
 */
export async function clickPinContextButton(webview: WebviewView): Promise<boolean> {
    try {
        const topBar = await waitForElement(webview, By.css('.mynah-prompt-input-top-bar'))
        const buttons = await topBar.findElements(
            By.css('.mynah-button.mynah-button-secondary.fill-state-always.status-clear.mynah-ui-clickable-item')
        )
        // double check the label to make sure it says "Pin Context"
        for (const button of buttons) {
            const label = await button.findElement(By.css('.mynah-button-label'))
            const labelText = await label.getText()
            console.log('THE BUTTON TEXT LABEL IS:', labelText)
            if (labelText === '@Pin Context') {
                console.log('Found Pin Context button, clicking...')
                await button.click()
                return true
            }
        }
        console.log('Pin Context button not found')
        return false
    } catch (e) {
        console.error('Error clicking Pin Context button:', e)
        return false
    }
}

/**
 * Lists all the possible Pin Context menu items in the console.
 * @param webview The WebviewView instance
 * @returns Promise<boolean> Returns the items as a WebElement List and the labels in a string array
 */
export async function getPinContextMenuItems(webview: WebviewView): Promise<{ items: WebElement[]; labels: string[] }> {
    try {
        const menuList = await waitForElement(webview, By.css('.mynah-detailed-list-items-block'))
        await new Promise((resolve) => setTimeout(resolve, 3000))
        const menuListItems = await menuList.findElements(By.css('.mynah-detailed-list-item.mynah-ui-clickable-item'))
        const labels: string[] = []

        for (const item of menuListItems) {
            try {
                const textWrapper = await item.findElement(By.css('.mynah-detailed-list-item-text'))
                const nameElement = await textWrapper.findElement(By.css('.mynah-detailed-list-item-name'))
                const labelText = await nameElement.getText()
                labels.push(labelText)
                console.log('Menu item found:', labelText)
            } catch (e) {
                labels.push('')
                console.log('Could not get text for menu item')
            }
        }

        return { items: menuListItems, labels }
    } catch (e) {
        console.error('Error getting Pin Context menu items:', e)
        return { items: [], labels: [] }
    }
}

/**
 * Clicks a specific item in the Pin Context menu by its label text
 * @param webview The WebviewView instance
 * @param itemName The text label of the menu item to click
 * @returns Promise<boolean> True if the item was found and clicked, false otherwise
 *
 * NOTE: To find all possible text labels, you can call getPinContextMenuItems
 */
export async function clickPinContextMenuItem(webview: WebviewView, itemName: string): Promise<boolean> {
    try {
        const menuList = await waitForElement(webview, By.css('.mynah-detailed-list-items-block'))
        await new Promise((resolve) => setTimeout(resolve, 3000))
        const menuListItems = await menuList.findElements(By.css('.mynah-detailed-list-item.mynah-ui-clickable-item'))
        for (const item of menuListItems) {
            try {
                const textWrapper = await item.findElement(By.css('.mynah-detailed-list-item-text'))
                const nameElement = await textWrapper.findElement(By.css('.mynah-detailed-list-item-name'))
                const labelText = await nameElement.getText()

                if (labelText === itemName) {
                    console.log(`Clicking Pin Context menu item: ${itemName}`)
                    await item.click()
                    return true
                }
            } catch (e) {
                continue
            }
        }

        console.log(`Pin Context menu item not found: ${itemName}`)
        return false
    } catch (e) {
        console.error(`Error clicking Pin Context menu item ${itemName}:`, e)
        return false
    }
}
