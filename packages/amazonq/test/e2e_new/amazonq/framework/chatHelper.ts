/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { By, WebviewView } from 'vscode-extension-tester'
import { waitForElement } from './generalHelper'

/* Writes a prompt to the chat input and waits for a response

Logic:
Finds the chat input element using the .mynah-chat-prompt-input CSS selector,
sends the provided prompt test, clicks the send button, and waits for a chat
response. Returns true if successful, throws an error if the response times out */

export async function writeToChat(prompt: string, webview: WebviewView): Promise<boolean> {
    const chatInput = await waitForElement(webview, By.css('.mynah-chat-prompt-input'))
    await chatInput.sendKeys(prompt)
    const sendButton = await waitForElement(webview, By.css('.mynah-chat-prompt-button'))
    await sendButton.click()
    return true
}

/* Waits for a chat response and outputs whether the response is "correct"

Logic: 
The overall conversation container's css is .mynah-chat-items-conversation-container. 
Within that container we can check how many elements exist. If there is 2 elements,
we can assume that the chat response has been generated. However, we must grab the 
latest conversation container, as there can be multiple conversations in the webview. */

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
