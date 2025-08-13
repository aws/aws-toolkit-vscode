/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { By, WebElement, WebviewView } from 'vscode-extension-tester'
import { writeToChat } from '../utils/generalUtils'
import { sleep, waitForElements } from '../utils/generalUtils'

/**
 * Gets all quick action command menu items
 * @param webview The WebviewView instance
 * @returns Promise<{items: WebElement[], texts: string[]}> Array of menu items and their text labels
 */
export async function getQuickActionsCommands(webview: WebviewView): Promise<{ items: WebElement[]; texts: string[] }> {
    await writeToChat('/', webview, false)
    await sleep(2000)

    const menuItems = await waitForElements(
        webview,
        By.css('.mynah-detailed-list-item.mynah-ui-clickable-item.target-command'),
        10000
    )

    const menuTexts = []
    for (let i = 0; i < menuItems.length; i++) {
        const text = await menuItems[i].getText()
        menuTexts.push(text)
    }

    return { items: menuItems, texts: menuTexts }
}

/**
 * Clicks a specific quick action command by name
 * @param webview The WebviewView instance
 * @param commandName The name of the command to click
 */
export async function clickQuickActionsCommand(webview: WebviewView, commandName: string): Promise<void> {
    const { items, texts } = await getQuickActionsCommands(webview)
    if (items.length === 0) {
        throw new Error('No quick action commands found')
    }
    const indexToClick = texts.findIndex((text) => text === commandName)

    if (indexToClick === -1) {
        throw new Error(`Command "${commandName}" not found`)
    }
    await items[indexToClick].click()
    await sleep(3000)
}
