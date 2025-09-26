/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { WebviewView } from 'vscode-extension-tester'
import { closeAllTabs } from '../utils/cleanupUtils'
import { testContext } from '../utils/testContext'
import { clickQuickActionsCommand } from '../helpers/quickActionsHelper'
import { clearChatInput } from '../utils/generalUtils'

describe('Amazon Q Chat Quick Actions Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(300000)
    let webviewView: WebviewView

    before(async function () {
        webviewView = testContext.webviewView
    })

    afterEach(async () => {
        await closeAllTabs(webviewView)
    })

    it('/help Test', async () => {
        await clickQuickActionsCommand(webviewView, '/help')
        await clearChatInput(webviewView)
    })
    it('/clear Test', async () => {
        await clickQuickActionsCommand(webviewView, '/clear')
    })
    it('/compact Test', async () => {
        await clickQuickActionsCommand(webviewView, '/compact')
        await clearChatInput(webviewView)
    })
    it('/tramsform Test', async () => {
        await clickQuickActionsCommand(webviewView, '/transform')
        await clearChatInput(webviewView)
    })
})
