/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { By, WebElement, WebviewView } from 'vscode-extension-tester'
import { writeToChat } from '../chat/chatHelper'
import { sleep, waitForElements } from '../utils/generalHelper'

/**
 * Gets all backslash command menu items
 * @param webview The WebviewView instance
 * @returns Promise<{items: WebElement[], texts: string[]}> Array of menu items and their text labels
 */
export async function getBackslashCommands(webview: WebviewView): Promise<{ items: WebElement[]; texts: string[] }> {
    try {
        await writeToChat('/', webview, false)
        await sleep(2000)

        const menuItems = await waitForElements(
            webview,
            By.css('.mynah-detailed-list-item.mynah-ui-clickable-item.target-command'),
            10000
        )

        const menuTexts = []
        for (let i = 0; i < menuItems.length; i++) {
            try {
                const text = await menuItems[i].getText()
                menuTexts.push(text)
                console.log(`Command ${i + 1}: ${text}`)
            } catch (e) {
                menuTexts.push('')
                console.log(`Could not get text for command ${i + 1}`)
            }
        }

        console.log(`Found ${menuItems.length} backslash command items`)
        return { items: menuItems, texts: menuTexts }
    } catch (e) {
        console.error('Error getting backslash commands:', e)
        return { items: [], texts: [] }
    }
}

/**
 * Clicks a specific backslash command by name
 * @param webview The WebviewView instance
 * @param commandName The name of the command to click
 * @returns Promise<boolean> True if command was found and clicked, false otherwise
 */
export async function clickBackslashCommand(webview: WebviewView, commandName: string): Promise<boolean> {
    try {
        const { items, texts } = await getBackslashCommands(webview)
        if (items.length === 0) {
            console.log('No backslash commands found to click')
            return false
        }
        const indexToClick = texts.findIndex((text) => text === commandName)

        if (indexToClick === -1) {
            console.log(`Command "${commandName}" not found`)
            return false
        }
        console.log(`Clicking on command: ${commandName}`)
        await items[indexToClick].click()
        await sleep(3000)
        console.log('Command clicked successfully')
        return true
    } catch (e) {
        console.error('Error clicking backslash command:', e)
        return false
    }
}
