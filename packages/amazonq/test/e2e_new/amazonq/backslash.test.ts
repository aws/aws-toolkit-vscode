/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import './utils/setup'
import { WebviewView } from 'vscode-extension-tester'
import { closeAllTabs, dismissOverlayIfPresent } from './framework/cleanupHelper'
import { testContext } from './utils/testContext'
import { clickBackslashCommand } from './framework/backslashHelper'
import { clearChat } from './framework/chatHelper'

describe('Amazon Q Chat Backslash Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(150000)
    let webviewView: WebviewView

    before(async function () {
        webviewView = testContext.webviewView!
    })

    after(async function () {
        await closeAllTabs(webviewView)
    })

    afterEach(async () => {
        // before closing the tabs, make sure that any overlays have been dismissed
        await dismissOverlayIfPresent(webviewView)
        await clearChat(webviewView)
    })

    it('Backslash Test', async () => {
        await clickBackslashCommand(webviewView, 'dev')
    })
})
