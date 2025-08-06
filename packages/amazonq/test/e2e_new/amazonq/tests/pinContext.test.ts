/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { WebviewView } from 'vscode-extension-tester'
import { closeAllTabs, dismissOverlayIfPresent } from '../utils/cleanupUtils'
import { testContext } from '../utils/testContext'
import { clickPinContextButton, getPinContextMenuItems, clickPinContextMenuItem } from '../helpers/pinContextHelper'
import { clearChat, sleep } from '../utils/generalUtils'

describe('Amazon Q Pin Context Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(50000)
    let webviewView: WebviewView

    beforeEach(async function () {
        webviewView = testContext.webviewView
        await sleep(5000)
    })

    after(async function () {
        await closeAllTabs(webviewView)
    })

    afterEach(async () => {
        await dismissOverlayIfPresent(webviewView)
        await clearChat(webviewView)
    })

    it('Pin Context Test @workspace', async () => {
        await clickPinContextButton(webviewView)
        await getPinContextMenuItems(webviewView)
        await clickPinContextMenuItem(webviewView, '@workspace')
    })
    it('Pin Context Test Folders', async () => {
        await clickPinContextButton(webviewView)
        await getPinContextMenuItems(webviewView)
        await clickPinContextMenuItem(webviewView, 'Folders')
    })
    it('Pin Context Test Files', async () => {
        await clickPinContextButton(webviewView)
        await getPinContextMenuItems(webviewView)
        await clickPinContextMenuItem(webviewView, 'Files')
    })
    it('Pin Context Test Code', async () => {
        await clickPinContextButton(webviewView)
        await getPinContextMenuItems(webviewView)
        await clickPinContextMenuItem(webviewView, 'Code')
    })
    it('Pin Context Test Prompts', async () => {
        await clickPinContextButton(webviewView)
        await getPinContextMenuItems(webviewView)
        await clickPinContextMenuItem(webviewView, 'Prompts')
    })
    it('Pin Context Test Image', async () => {
        await clickPinContextButton(webviewView)
        await getPinContextMenuItems(webviewView)
        await clickPinContextMenuItem(webviewView, 'Image')
    })
})
