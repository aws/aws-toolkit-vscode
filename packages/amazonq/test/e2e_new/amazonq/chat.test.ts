/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { By, WebviewView } from 'vscode-extension-tester'
import { loginToAmazonQ } from './framework/loginHelper'
import { closeAllTabs } from './framework/cleanupHelper'
import { waitForElement } from './framework/generalHelper'
import { waitForChatResponse } from './framework/chatHelper'

describe('Amazon Q Chat Basic Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(150000)
    let webviewView: WebviewView

    before(async function () {
        const result = await loginToAmazonQ()
        webviewView = result.webviewView
    })

    afterEach(async () => {
        await closeAllTabs(webviewView)
    })

    it('Chat Prompt Test', async () => {
        const chatInput = await waitForElement(webviewView, By.css('.mynah-chat-prompt-input'))
        await chatInput.sendKeys('Hello, Amazon Q!')
        const sendButton = await waitForElement(webviewView, By.css('.mynah-chat-prompt-button'))
        await sendButton.click()
        const responseReceived = await waitForChatResponse(webviewView)
        if (!responseReceived) {
            throw new Error('Chat response not received within timeout')
        }

        console.log('Chat response detected successfully')
    })
})
