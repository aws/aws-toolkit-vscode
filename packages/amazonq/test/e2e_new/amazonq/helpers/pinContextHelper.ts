/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { By, WebviewView } from 'vscode-extension-tester'
import { sleep, waitForElement } from '../utils/generalUtils'
import { WebElement } from 'vscode-extension-tester'

/**
 * Clicks the "Pin Context" button in the chat interface
 * @param webview The WebviewView instance
 * @throws Error if button is not found
 */
export async function clickPinContextButton(webview: WebviewView): Promise<void> {
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
            return
        }
    }
    throw new Error('Pin Context button not found')
}

/**
 * Lists all the possible Pin Context menu items in the console.
 * @param webview The WebviewView instance
 * @returns Promise<boolean> Returns the items as a WebElement List and the labels in a string array
 */
export async function getPinContextMenuItems(webview: WebviewView): Promise<{ items: WebElement[]; labels: string[] }> {
    const menuList = await waitForElement(webview, By.css('.mynah-detailed-list-items-block'))
    // TODO: Fix the need for a sleep function to be required at all.
    await sleep(100)
    const menuListItems = await menuList.findElements(By.css('.mynah-detailed-list-item.mynah-ui-clickable-item'))

    if (menuListItems.length === 0) {
        throw new Error('No pin context menu items found')
    }

    const labels: string[] = []
    for (const item of menuListItems) {
        const textWrapper = await item.findElement(By.css('.mynah-detailed-list-item-text'))
        const nameElement = await textWrapper.findElement(By.css('.mynah-detailed-list-item-name'))
        const labelText = await nameElement.getText()
        labels.push(labelText)
        console.log('Menu item found:', labelText)
    }

    return { items: menuListItems, labels }
}

/**
 * Clicks a specific item in the Pin Context menu by its label text
 * @param webview The WebviewView instance
 * @param itemName The text label of the menu item to click
 * @throws Error if the menu item is not found or DOM structure is invalid
 *
 * NOTE: To find all possible text labels, you can call getPinContextMenuItems
 */
export async function clickPinContextMenuItem(webview: WebviewView, itemName: string): Promise<void> {
    const menuList = await waitForElement(webview, By.css('.mynah-detailed-list-items-block'))
    await sleep(100)
    const menuListItems = await menuList.findElements(By.css('.mynah-detailed-list-item.mynah-ui-clickable-item'))
    for (const item of menuListItems) {
        const textWrapper = await item.findElement(By.css('.mynah-detailed-list-item-text'))
        const nameElement = await textWrapper.findElement(By.css('.mynah-detailed-list-item-name'))
        const labelText = await nameElement.getText()

        if (labelText === itemName) {
            console.log(`Clicking Pin Context menu item: ${itemName}`)
            await item.click()
            return
        }
    }

    throw new Error(`Pin Context menu item not found: ${itemName}`)
}
/**
 * Lists all the possible Sub-menu items in the console.
 * @param webview The WebviewView instance
 * @returns Promise<boolean> Returns the items as a WebElement List and the labels in a string array
 */
export async function getSubMenuItems(webview: WebviewView): Promise<{ items: WebElement[]; labels: string[] }> {
    const menuList = await waitForElement(webview, By.css('.mynah-detailed-list-items-block'))
    await sleep(100)
    const menuListItems = await menuList.findElements(By.css('.mynah-detailed-list-item.mynah-ui-clickable-item'))

    if (menuListItems.length === 0) {
        throw new Error('No sub-menu items found')
    }

    const labels: string[] = []
    for (const item of menuListItems) {
        const textWrapper = await item.findElement(
            By.css('.mynah-detailed-list-item-text.mynah-detailed-list-item-text-direction-row')
        )
        const nameElement = await textWrapper.findElement(By.css('.mynah-detailed-list-item-name'))
        const labelText = await nameElement.getText()
        labels.push(labelText)
        console.log('Menu item found:', labelText)
    }

    return { items: menuListItems, labels }
}
/**
 * Clicks a specific item in the Sub-Menu by its label text
 * @param webview The WebviewView instance
 * @param itemName The text label of the menu item to click
 * @throws Error if the menu item is not found or DOM structure is invalid
 *
 * NOTE: To find all possible text labels, you can call getPinContextMenuItems
 */
export async function clickSubMenuItem(webview: WebviewView, itemName: string): Promise<void> {
    const menuList = await waitForElement(webview, By.css('.mynah-detailed-list-items-block'))
    await sleep(100)
    const menuListItems = await menuList.findElements(By.css('.mynah-detailed-list-item.mynah-ui-clickable-item'))
    for (const item of menuListItems) {
        const textWrapper = await item.findElement(
            By.css('.mynah-detailed-list-item-text.mynah-detailed-list-item-text-direction-row')
        )
        const nameElement = await textWrapper.findElement(By.css('.mynah-detailed-list-item-name'))
        const labelText = await nameElement.getText()

        if (labelText === itemName) {
            console.log(`Clicking Pin Context menu item: ${itemName}`)
            await item.click()
            return
        }
    }

    throw new Error(`Pin Context menu item not found: ${itemName}`)
}
