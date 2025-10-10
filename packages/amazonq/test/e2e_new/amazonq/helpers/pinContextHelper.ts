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
    try {
        const topBar = await waitForElement(webview, By.css('.mynah-prompt-input-top-bar'))
        const buttons = await topBar.findElements(
            By.css('.mynah-button.mynah-button-secondary.fill-state-always.status-clear.mynah-ui-clickable-item')
        )
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
    } catch (e) {
        throw new Error(`Failed to click pin context button: ${e}`)
    }
}

/**
 * Lists all the possible Pin Context menu items in the console.
 * @param webview The WebviewView instance
 * @returns Promise<boolean> Returns the items as a WebElement List and the labels in a string array
 */
export async function getPinContextMenuItems(webview: WebviewView): Promise<{ items: WebElement[]; labels: string[] }> {
    try {
        const items = await webview.findElements(
            By.xpath(
                `//div[contains(@class, 'mynah-detailed-list-item') and contains(@class, 'mynah-ui-clickable-item')]`
            )
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
    } catch (e) {
        throw new Error(`Failed to get pin context menu items: ${e}`)
    }
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
    try {
        const item = await waitForElement(
            webview,
            By.xpath(
                `//div[contains(@class, 'mynah-detailed-list-item') and contains(@class, 'mynah-ui-clickable-item')]//div[contains(@class, 'mynah-detailed-list-item-name') and text()='${itemName}']`
            )
        )
        await item.click()
    } catch (e) {
        throw new Error(`Failed to click pin context menu item '${itemName}': ${e}`)
    }
}

/**
 * Lists all the possible Sub-menu items in the console.
 * @param webview The WebviewView instance
 * @returns Promise<boolean> Returns the items as a WebElement List and the labels in a string array
 */
export async function getSubMenuItems(webview: WebviewView): Promise<{ items: WebElement[]; labels: string[] }> {
    try {
        const items = await webview.findElements(
            By.xpath(
                `//div[contains(@class, 'mynah-detailed-list-item') and contains(@class, 'mynah-ui-clickable-item')]`
            )
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
    } catch (e) {
        throw new Error(`Failed to get sub-menu items: ${e}`)
    }
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
    try {
        await sleep(0)
        const item = await waitForElement(
            webview,
            By.xpath(
                `//div[contains(@class, 'mynah-detailed-list-item') and contains(@class, 'mynah-ui-clickable-item')]//div[contains(@class, 'mynah-detailed-list-item-name') and text()='${itemName}']`
            )
        )
        await item.click()
    } catch (e) {
        throw new Error(`Failed to click sub-menu item '${itemName}': ${e}`)
    }
}

export async function clickAddPromptButton(webviewView: WebviewView): Promise<void> {
    try {
        const addPrompt = await waitForElement(webviewView, By.css('.mynah-ui-icon.mynah-ui-icon-list-add'))
        await addPrompt.click()
    } catch (e) {
        throw new Error(`Failed to click add prompt button: ${e}`)
    }
}

export async function enterChatInput(webviewView: WebviewView): Promise<void> {
    try {
        const chatInput = await waitForElement(webviewView, By.css('[data-testid="chat-item-form-item-text-input"]'))
        await chatInput.sendKeys('test')
    } catch (e) {
        throw new Error(`Failed to enter chat input: ${e}`)
    }
}

export async function clickCreatePromptButton(webviewView: WebviewView): Promise<void> {
    try {
        const createPrompt = await waitForElement(
            webviewView,
            By.css('.mynah-button.fill-state-always.status-primary.mynah-ui-clickable-item')
        )
        await createPrompt.click()
    } catch (e) {
        throw new Error(`Failed to click create prompt button: ${e}`)
    }
}
