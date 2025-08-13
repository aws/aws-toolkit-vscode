/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { WebviewView } from 'vscode-extension-tester'
import { testContext } from '../utils/testContext'
import { clearChat, waitForChatResponse, writeToChat } from '../utils/generalUtils'
import { closeAllTabs } from '../utils/cleanupUtils'

describe('Amazon Q Chat Basic Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(150000)
    let webviewView: WebviewView

    before(async function () {
        webviewView = testContext.webviewView
    })

    after(async function () {
        await closeAllTabs(webviewView)
    })

    afterEach(async () => {
        await clearChat(webviewView)
    })

    it('Chat Prompt Test', async () => {
        await writeToChat('Hello, Amazon Q!', webviewView)
        await waitForChatResponse(webviewView)
    })
})
