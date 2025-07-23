/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { By, WebviewView, WebElement } from 'vscode-extension-tester'
import { until } from 'selenium-webdriver'

/**
 * General sleep function to wait for a specified amount of time
 * @param timeout Time in miliseconds
 */
export async function sleep(timeout: number) {
    await new Promise((resolve) => setTimeout(resolve, timeout))
}

/**
 * Waits for an element to be located, if there are multiple elements with the same locator it will just return the first one
 * @param webview The WebviewView instance
 * @param locator The selenium locator
 * @param timeout The timeout in milliseconds (Optional)
 * @returns Promise<WebElement> Returns the element found
 */
export async function waitForElement(webview: WebviewView, locator: By, timeout?: number): Promise<WebElement> {
    const driver = webview.getDriver()
    await driver.wait(until.elementsLocated(locator), timeout)
    return await webview.findWebElement(locator)
}

/**
 * Waits for multiple elements with the same css selector to be located
 * @param webview The WebviewView instance
 * @param locator The selenium locator
 * @param timeout The timeout in milliseconds (Optional)
 * @returns Promise<WebElement[]> Returns an array of elements found
 */
export async function waitForElements(webview: WebviewView, locator: By, timeout?: number): Promise<WebElement[]> {
    const driver = webview.getDriver()
    await driver.wait(until.elementsLocated(locator), timeout)
    return await webview.findWebElements(locator)
}

/**
 * Writes text to the chat input and optionally sends it
 * @param prompt The text to write in the chat input
 * @param webview The WebviewView instance
 * @param send Whether to click the send button (defaults to true)
 * @returns Promise<boolean> True if successful
 */
export async function writeToChat(prompt: string, webview: WebviewView, send = true): Promise<boolean> {
    const chatInput = await waitForElement(webview, By.css('.mynah-chat-prompt-input'))
    await chatInput.sendKeys(prompt)
    if (send === true) {
        const sendButton = await waitForElement(webview, By.css('.mynah-chat-prompt-button'))
        await sendButton.click()
    }
    return true
}

/**
 * Waits for a chat response to be generated
 * @param webview The WebviewView instance
 * @param timeout The timeout in milliseconds
 * @returns Promise<boolean> True if a response was detected, false if timeout occurred
 */
export async function waitForChatResponse(webview: WebviewView, timeout = 15000): Promise<boolean> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
        const conversationContainers = await webview.findWebElements(By.css('.mynah-chat-items-conversation-container'))

        if (conversationContainers.length > 0) {
            const latestContainer = conversationContainers[conversationContainers.length - 1]

            const chatItems = await latestContainer.findElements(By.css('*'))

            if (chatItems.length >= 2) {
                return true
            }
        }
        await sleep(500)
    }

    return false
}

/**
 * Clears the text in the chat input field
 * @param webview The WebviewView instance
 * @returns Promise<boolean> True if successful, false if an error occurred
 */
export async function clearChat(webview: WebviewView): Promise<boolean> {
    try {
        const chatInput = await waitForElement(webview, By.css('.mynah-chat-prompt-input'))
        await chatInput.sendKeys(
            process.platform === 'darwin'
                ? '\uE03D\u0061' // Command+A on macOS
                : '\uE009\u0061' // Ctrl+A on Windows/Linux
        )
        await chatInput.sendKeys('\uE003') // Backspace
        return true
    } catch (e) {
        console.error('Error clearing chat input:', e)
        return false
    }
}

/**
 * Finds an item based on the text
 * @param items WebElement array to search
 * @param text The text of the item
 * @returns Promise<WebElement> The first element that contains the specified text
 * TO-DO: Make this function more general by eliminated the By.css('.title')
 */
export async function findItemByText(items: WebElement[], text: string) {
    for (const item of items) {
        const titleDivs = await item.findElements(By.css('.title'))
        for (const titleDiv of titleDivs) {
            const titleText = await titleDiv.getText()
            if (titleText?.trim().startsWith(text)) {
                return item
            }
        }
    }
    throw new Error(`Item with text "${text}" not found`)
}
