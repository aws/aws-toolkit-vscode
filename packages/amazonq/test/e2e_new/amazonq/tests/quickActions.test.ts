/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { WebviewView } from 'vscode-extension-tester'
import { closeAllTabs, dismissOverlayIfPresent } from '../utils/cleanupUtils'
import { testContext } from '../utils/testContext'
import { clickQuickActionsCommand } from '../helpers/quickActionsHelper'
import { clearChat } from '../utils/generalUtils'

describe('Amazon Q Chat Quick Actions Functionality', function () {
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
        // before closing the tabs, make sure that any overlays have been dismissed
        await dismissOverlayIfPresent(webviewView)
        await clearChat(webviewView)
    })

    it('Quick Actions Test', async () => {
        await clickQuickActionsCommand(webviewView, 'dev')
    })
})
