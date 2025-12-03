/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { By, WebElement, WebviewView } from 'vscode-extension-tester'
import {
    waitForElement,
    writeToChat,
    waitForChatResponse,
    findMynahCardsBody,
    findItemByText,
    clickMoreContentIndicator,
    clickButton,
} from '../utils/generalUtils'
import { sleep } from '../utils/generalUtils'

/**
 * Gets all quick action command menu items
 * @param webview The WebviewView instance
 * @returns Promise<{items: WebElement[], texts: string[]}> Array of menu items and their text labels
 */
export async function getQuickActionsCommands(webview: WebviewView): Promise<{ items: WebElement[]; texts: string[] }> {
    try {
        await writeToChat('/', webview, false)
        // need to give the overlay time to load
        await sleep(2000)
        const overlayWrapper = await waitForElement(webview, By.css('.mynah-chat-prompt-quick-picks-overlay-wrapper'))
        const quickActionItems = await overlayWrapper.findElements(
            By.css('[data-testid="prompt-input-quick-pick-item"]')
        )
        if (quickActionItems.length === 0) {
            throw new Error('No quick action commands found')
        }
        const quickActionTexts: string[] = []
        for (const item of quickActionItems) {
            const text = await item.findElement(By.css('.mynah-detailed-list-item-name')).getText()
            quickActionTexts.push(text)
        }

        const requiredTexts = ['/help', '/transform', '/clear', '/compact']
        const missingTexts = requiredTexts.filter((text) => !quickActionTexts.includes(text))

        if (missingTexts.length > 0) {
            throw new Error(`Missing required texts: ${missingTexts.join(', ')}`)
        }

        return { items: quickActionItems, texts: quickActionTexts }
    } catch (e) {
        throw new Error(`Failed to get quick actions commands`)
    }
}

/**
 * Clicks a specific quick action command by name
 * @param webview The WebviewView instance
 * @param commandName The name of the command to click
 */
export async function clickQuickActionsCommand(webview: WebviewView, commandName: string): Promise<void> {
    try {
        await writeToChat('/', webview, false)
        // need to give the overlay time to load
        await sleep(2000)
        const overlayWrapper = await waitForElement(webview, By.css('.mynah-chat-prompt-quick-picks-overlay-wrapper'))
        const quickActionItems = await overlayWrapper.findElements(
            By.css('[data-testid="prompt-input-quick-pick-item"]')
        )
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
    } catch (e) {
        throw new Error(`Failed to click quick actions command '${commandName}'`)
    }
}
/**
 * Clicks on the AWS Responsible AI Policy link
 * @param webview The WebviewView instance
 */
export async function clickAWSResponsibleAIPolicy(webview: WebviewView): Promise<void> {
    try {
        const policyLink = await webview.findWebElement(
            By.css(`a.mynah-ui-clickable-item:contains("AWS Responsible AI Policy")`)
        )
        await policyLink.click()
    } catch (error) {
        throw new Error(`Failed to click AWS Responsible AI Policy`)
    }
}

/**
 * Tests the /compact command functionality
 * @param webviewView The WebviewView instance
 */
export async function testCompactCommand(webviewView: WebviewView): Promise<void> {
    await writeToChat('Hello, Amazon Q!', webviewView)
    await waitForChatResponse(webviewView)
    await sleep(4000)
    await clickQuickActionsCommand(webviewView, '/compact')
    await waitForChatResponse(webviewView)
    await sleep(5000)
    await clickMoreContentIndicator(webviewView)
    const list = await findMynahCardsBody(webviewView)
    await sleep(5000)
    await findItemByText(list, 'Conversation history has been compacted successfully!')
}

/**
 * Tests the /transform command functionality
 * @param webviewView The WebviewView instance
 */
export async function testTransformCommand(webviewView: WebviewView): Promise<void> {
    await clickQuickActionsCommand(webviewView, '/transform')
    const list = await findMynahCardsBody(webviewView)
    try {
        await findItemByText(list, 'Welcome to Code Transformation!')
    } catch (e) {
        throw new Error('Transform command failed: Expected welcome message not found')
    }
}

/**
 * Tests the /clear command functionality
 * @param webviewView The WebviewView instance
 */
export async function testClearCommand(webviewView: WebviewView): Promise<void> {
    await writeToChat('Hello, Amazon Q!', webviewView)
    await sleep(5000)
    await clickQuickActionsCommand(webviewView, '/clear')
    await sleep(500)

    const list = await findMynahCardsBody(webviewView)

    // Verify the message is no longer present
    let messageFound = false
    try {
        await findItemByText(list, 'Hello, Amazon Q!')
        messageFound = true
    } catch (e) {
        // Message not found - this is expected after /clear
    }

    if (messageFound) {
        throw new Error('Clear command failed: User message still present')
    }
}

/**
 * Clicks the Open Job History button in transform view
 * @param webviewView The WebviewView instance
 */
export async function clickOpenJobHistory(webviewView: WebviewView): Promise<void> {
    await clickButton(
        webviewView,
        '[data-testid="chat-item-buttons-wrapper"]',
        '[action-id="gumbyViewJobHistory"]',
        'Open Job History'
    )
}
