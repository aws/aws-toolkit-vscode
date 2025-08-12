/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { WebviewView, By } from 'vscode-extension-tester'
import { testContext } from '../utils/testContext'
import { waitForChatResponse, writeToChat, waitForElement } from '../utils/generalUtils'
import { closeAllTabs } from '../utils/cleanupUtils'

describe('Amazon Q Chat Basic Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(150000)
    let webviewView: WebviewView

    before(async function () {
        webviewView = testContext.webviewView
    })

    afterEach(async function () {
        await closeAllTabs(webviewView)
    })

    it('Allows User to Chat with AmazonQ', async () => {
        await writeToChat('Hello, Amazon Q!', webviewView)
        const responseReceived = await waitForChatResponse(webviewView)
        if (!responseReceived) {
            throw new Error('Chat response not received within timeout')
        }
        console.log('Chat response detected successfully')
    })
    it('Allows User to Add Multiple Chat Tabs', async () => {
        console.log('Starting Multiple Chat Test')
        for (let i = 0; i < 3; i++) {
            const addChat = await webviewView.findWebElement(By.css('.mynah-ui-icon.mynah-ui-icon-plus'))
            await addChat.click()
        }
    })
    it('Allows User to View Chat History', async () => {
        console.log('Starting View History Test')
        const viewHistory = await webviewView.findWebElement(By.css('.mynah-ui-icon.mynah-ui-icon-history'))
        await viewHistory.click()
        await waitForElement(webviewView, By.css('.mynah-detailed-list-item-groups-wrapper'))
        console.log('History wrapper found successfully')
        const closeHistory = await waitForElement(webviewView, By.css('.mynah-ui-icon.mynah-ui-icon-cancel'))
        await closeHistory.click()
    })
})
