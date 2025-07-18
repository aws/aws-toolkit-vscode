/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { By, WebviewView } from 'vscode-extension-tester'
import { waitForElement } from './generalHelper'

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
        await new Promise((resolve) => setTimeout(resolve, 500))
    }

    return false
}
