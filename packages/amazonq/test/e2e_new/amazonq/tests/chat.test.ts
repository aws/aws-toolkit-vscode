/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { WebviewView } from 'vscode-extension-tester'
import { testContext } from '../utils/testContext'
import { sleep, waitForChatResponse, writeToChat } from '../utils/generalUtils'
import { closeAllTabs } from '../utils/cleanupUtils'
import { addNewChatTab, verifyMaxTabsTooltip, verifyAmazonQResponse } from '../helpers/chatHelper'

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
        await waitForChatResponse(webviewView)
        await sleep(5000)
        await verifyAmazonQResponse(webviewView)
    })

    it('Allows User to Add Multiple Chat Tabs', async () => {
        console.log('Starting Multiple Chat Test')
        for (let i = 0; i < 9; i++) {
            await addNewChatTab(webviewView)
        }
        await verifyMaxTabsTooltip(webviewView)
    })
})
