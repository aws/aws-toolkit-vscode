/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import './utils/setup'
import { WebviewView } from 'vscode-extension-tester'
import { testContext } from './utils/testContext'
import { clearChat, waitForChatResponse, writeToChat } from './framework/chatHelper'

describe('Amazon Q Chat Basic Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(150000)
    let webviewView: WebviewView

    before(async function () {
        webviewView = testContext.webviewView!
    })

    afterEach(async () => {
        await clearChat(webviewView)
    })

    it('Chat Prompt Test', async () => {
        await writeToChat('Hello, Amazon Q!', webviewView)
        const responseReceived = await waitForChatResponse(webviewView)
        if (!responseReceived) {
            throw new Error('Chat response not received within timeout')
        }
        console.log('Chat response detected successfully')
    })
})
