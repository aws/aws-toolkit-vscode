/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { By, WebviewView } from 'vscode-extension-tester'

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
