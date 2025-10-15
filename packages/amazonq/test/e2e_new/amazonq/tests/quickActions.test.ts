/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { WebviewView } from 'vscode-extension-tester'
import { closeAllTabs } from '../utils/cleanupUtils'
import { testContext } from '../utils/testContext'
import { clickQuickActionsCommand, getQuickActionsCommands } from '../helpers/quickActionsHelper'
import { clearChatInput } from '../utils/generalUtils'

describe('Amazon Q Chat Quick Actions Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(300000)
    let webviewView: WebviewView

    before(async function () {
        webviewView = testContext.webviewView
    })

    afterEach(async () => {
        await clearChatInput(webviewView)
        await closeAllTabs(webviewView)
    })

    it('Quick Actions Test', async () => {
        await getQuickActionsCommands(webviewView)
    })

    it('/help Test', async () => {
        await clickQuickActionsCommand(webviewView, '/help')
    })
    it('/clear Test', async () => {
        await clickQuickActionsCommand(webviewView, '/clear')
    })
    it('/compact Test', async () => {
        await clickQuickActionsCommand(webviewView, '/compact')
    })
    it('/transform Test', async () => {
        await clickQuickActionsCommand(webviewView, '/transform')
    })
})
