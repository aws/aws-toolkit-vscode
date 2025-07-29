/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { WebviewView } from 'vscode-extension-tester'
import { testContext } from '../utils/testContext'
import { sleep } from '../utils/generalUtils'
import { clickMCPCloseButton, clickToolsButton, dismissOverlay } from '../helpers/mcpHelper'

describe('Amazon Q MCP Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(150000)
    let webviewView: WebviewView

    before(async function () {
        webviewView = testContext.webviewView
    })

    after(async function () {})

    afterEach(async () => {})

    it('MCP Server', async () => {
        /**
         * TO-DO
         * Write a command to click the button DONE
         *
         * Close MCP Server
         */
        await clickToolsButton(webviewView)
        console.log('TOOLS BUTTON CLICKED')
        await dismissOverlay(webviewView)
        console.log('DISMISS OVERLAY')
        sleep(5000)
        await clickMCPCloseButton(webviewView)
        console.log('CLOSE BUTTON CLICKED')
        await dismissOverlay(webviewView)
    })
})
