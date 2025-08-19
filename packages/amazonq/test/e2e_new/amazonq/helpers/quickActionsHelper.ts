/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { By, WebElement, WebviewView } from 'vscode-extension-tester'
import { waitForElement, writeToChat } from '../utils/generalUtils'
import { sleep } from '../utils/generalUtils'

/**
 * Gets all quick action command menu items
 * @param webview The WebviewView instance
 * @returns Promise<{items: WebElement[], texts: string[]}> Array of menu items and their text labels
 */
export async function getQuickActionsCommands(webview: WebviewView): Promise<{ items: WebElement[]; texts: string[] }> {
    await writeToChat('/', webview, false)
    // need to give the overlay time to load
    await sleep(2000)
    const overlayWrapper = await waitForElement(webview, By.css('.mynah-chat-prompt-quick-picks-overlay-wrapper'))
    const quickActionItems = await overlayWrapper.findElements(By.css('[data-testid="prompt-input-quick-pick-item"]'))
    if (quickActionItems.length === 0) {
        throw new Error('No quick action commands found')
    }
    const quickActionTexts = []
    for (const item of quickActionItems) {
        const text = await item.findElement(By.css('.mynah-detailed-list-item-name')).getText()
        quickActionTexts.push(text)
    }

    return { items: quickActionItems, texts: quickActionTexts }
}

/**
 * Clicks a specific quick action command by name
 * @param webview The WebviewView instance
 * @param commandName The name of the command to click
 */
export async function clickQuickActionsCommand(webview: WebviewView, commandName: string): Promise<void> {
    await writeToChat('/', webview, false)
    // need to give the overlay time to load
    await sleep(2000)
    const overlayWrapper = await waitForElement(webview, By.css('.mynah-chat-prompt-quick-picks-overlay-wrapper'))
    const quickActionItems = await overlayWrapper.findElements(By.css('[data-testid="prompt-input-quick-pick-item"]'))
    if (quickActionItems.length === 0) {
        throw new Error('No quick action commands found')
    }

    for (const item of quickActionItems) {
        const descriptionElement = await item.findElement(By.css('.mynah-detailed-list-item-name'))
        const description = await descriptionElement.getText()
        if (description.includes(commandName)) {
            await item.click()
            await sleep(3000)
            return
        }
    }

    throw new Error(`Command "${commandName}" not found`)
}
