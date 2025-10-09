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
    const items = await webview.findElements(
        By.xpath(`//div[contains(@class, 'mynah-detailed-list-item') and contains(@class, 'mynah-ui-clickable-item')]`)
    )

    if (items.length === 0) {
        throw new Error('No pin context menu items found')
    }

    const labels: string[] = []
    for (const item of items) {
        const nameElement = await item.findElement(By.css('.mynah-detailed-list-item-description'))
        const labelText = await nameElement.getText()
        labels.push(labelText)
        console.log('Menu item found:', labelText)
    }

    return { items, labels }
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
    const item = await waitForElement(
        webview,
        By.xpath(
            `//div[contains(@class, 'mynah-detailed-list-item') and contains(@class, 'mynah-ui-clickable-item')]//div[contains(@class, 'mynah-detailed-list-item-name') and text()='${itemName}']`
        )
    )
    await item.click()
}
/**
 * Lists all the possible Sub-menu items in the console.
 * @param webview The WebviewView instance
 * @returns Promise<boolean> Returns the items as a WebElement List and the labels in a string array
 */
export async function getSubMenuItems(webview: WebviewView): Promise<{ items: WebElement[]; labels: string[] }> {
    const items = await webview.findElements(
        By.xpath(`//div[contains(@class, 'mynah-detailed-list-item') and contains(@class, 'mynah-ui-clickable-item')]`)
    )

    if (items.length === 0) {
        throw new Error('No sub-menu items found')
    }

    const labels: string[] = []
    for (const item of items) {
        const nameElement = await item.findElement(By.css('.mynah-detailed-list-item-name'))
        const labelText = await nameElement.getText()
        labels.push(labelText)
        console.log('Menu item found:', labelText)
    }

    return { items, labels }
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
    // We require a sleep function of 0 so that the DOM of the SubMenu can load correctly.
    await sleep(0)
    const item = await waitForElement(
        webview,
        By.xpath(
            `//div[contains(@class, 'mynah-detailed-list-item') and contains(@class, 'mynah-ui-clickable-item')]//div[contains(@class, 'mynah-detailed-list-item-name') and text()='${itemName}']`
        )
    )
    await item.click()
}

export async function clickAddPromptButton(webviewView: WebviewView): Promise<void> {
    const addPrompt = await waitForElement(webviewView, By.css('.mynah-ui-icon.mynah-ui-icon-list-add'))
    await addPrompt.click()
}

export async function enterChatInput(webviewView: WebviewView): Promise<void> {
    const chatInput = await waitForElement(webviewView, By.css('[data-testid="chat-item-form-item-text-input"]'))
    await chatInput.sendKeys('test')
}

export async function clickCreatePromptButton(webviewView: WebviewView): Promise<void> {
    const createPrompt = await waitForElement(
        webviewView,
        By.css('.mynah-button.fill-state-always.status-primary.mynah-ui-clickable-item')
    )
    await createPrompt.click()
}
