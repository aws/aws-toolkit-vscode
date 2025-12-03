/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { WebviewView } from 'vscode-extension-tester'
import { closeAllTabs, dismissOverlayIfPresent } from '../utils/cleanupUtils'
import { testContext } from '../utils/testContext'
import {
    clickAWSResponsibleAIPolicy,
    clickQuickActionsCommand,
    getQuickActionsCommands,
    testCompactCommand,
    testTransformCommand,
    testClearCommand,
    clickOpenJobHistory,
} from '../helpers/quickActionsHelper'
import { clearChatInput, validateAmazonQResponse, closeTerminal, sleep } from '../utils/generalUtils'

describe('Amazon Q Chat Quick Actions Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(150000)
    let webviewView: WebviewView

    this.beforeEach(async function () {
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
        await validateAmazonQResponse(webviewView, true)
    })

    it('/clear Test', async () => {
        await testClearCommand(webviewView)
    })

    it('/compact Test', async () => {
        await testCompactCommand(webviewView)
    })

    it('/transform Test', async () => {
        await testTransformCommand(webviewView)
    })

    it('/transform history', async () => {
        await clickQuickActionsCommand(webviewView, '/transform')
        await sleep(2000)
        await dismissOverlayIfPresent(webviewView)
        await clickOpenJobHistory(webviewView)
        await closeTerminal(webviewView)
    })

    it('Click AWS Responsible AI Policy', async () => {
        await clickQuickActionsCommand(webviewView, '/transform')
        await clickAWSResponsibleAIPolicy(webviewView)
    })
})
