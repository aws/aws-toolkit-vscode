/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { WebviewView } from 'vscode-extension-tester'
import { testContext } from '../utils/testContext'
import {
    clickMCPAddButton,
    clickMCPCloseButton,
    clickMCPRefreshButton,
    clickToolsButton,
    configureMCPServer,
    saveMCPServerConfiguration,
} from '../helpers/mcpHelper'
import { closeAllTabs } from '../utils/cleanupUtils'

describe('Amazon Q MCP Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(150000)
    let webviewView: WebviewView

    before(async function () {
        webviewView = testContext.webviewView
    })

    after(async function () {
        await closeAllTabs(webviewView)
    })

    it('Test Amazon Q MCP Servers and Built-in Tools Access', async () => {
        await clickToolsButton(webviewView)
        await clickMCPCloseButton(webviewView)
    })

    it('Add new MCP Server', async () => {
        await clickToolsButton(webviewView)
        await clickMCPAddButton(webviewView)
        await configureMCPServer(webviewView)
        await saveMCPServerConfiguration(webviewView)
        await clickMCPCloseButton(webviewView)
    })

    it('Refresh MCP Server', async () => {
        await clickToolsButton(webviewView)
        await clickMCPRefreshButton(webviewView)
        await clickMCPCloseButton(webviewView)
    })
})
