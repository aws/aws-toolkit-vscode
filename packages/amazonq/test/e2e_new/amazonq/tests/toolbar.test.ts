/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { WebviewView } from 'vscode-extension-tester'
import { testContext } from '../utils/testContext'
import { closeAllTabs } from '../utils/cleanupUtils'
import {
    exportChat,
    selectHistoryItemAndVerify,
    viewAmazonLog,
    viewHistoryTab,
    waitForHistoryList,
} from '../helpers/toolbarHelper'

describe('Amazon Q Toolbar Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(150000)
    let webviewView: WebviewView

    before(async function () {
        webviewView = testContext.webviewView
    })

    afterEach(async function () {
        await closeAllTabs(webviewView)
    })

    it('Allows User to View Chat History', async () => {
        console.log('Starting View History Test')
        await viewHistoryTab(webviewView)
        await waitForHistoryList(webviewView)
        await selectHistoryItemAndVerify(webviewView)
    })

    it('Allows User to Export chat', async () => {
        console.log('Starting Export chat Test')
        await exportChat(webviewView)
    })

    it('Allows User to view Amazon log', async () => {
        console.log('Starting Amazon log Test')
        await viewAmazonLog(webviewView)
    })
})
