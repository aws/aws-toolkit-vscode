/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { WebviewView } from 'vscode-extension-tester'
import { closeAllTabs, dismissOverlayIfPresent } from '../utils/cleanupUtils'
import { testContext } from '../utils/testContext'
import { clickPinContextButton, getPinContextMenuItems, clickPinContextMenuItem } from '../helpers/pinContextHelper'
import { clearChatInput } from '../utils/generalUtils'

describe('Amazon Q Pin Context Functionality', function () {
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
        await dismissOverlayIfPresent(webviewView)
        await clearChatInput(webviewView)
    })

    it('Pin Context Test', async () => {
        await clickPinContextButton(webviewView)
        await getPinContextMenuItems(webviewView)
        await clickPinContextMenuItem(webviewView, '@workspace')
    })
})
