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
    clickToolsButton,
    configureMCPServer,
    saveMCPServerConfiguration,
} from '../helpers/mcpHelper'
import { sleep } from '../utils/generalUtils'

describe('Amazon Q MCP Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(150000)
    let webviewView: WebviewView

    before(async function () {
        webviewView = testContext.webviewView
    })

    after(async function () {})

    afterEach(async () => {})

    it('Test Amazon Q MCP Servers and Built-in Tools Access', async () => {
        await clickToolsButton(webviewView)
        await clickMCPCloseButton(webviewView)
    })

    it('Add new MCP Server', async () => {
        await clickToolsButton(webviewView)
        await clickMCPAddButton(webviewView)
        await configureMCPServer(webviewView)
        await sleep(5000)
        await saveMCPServerConfiguration(webviewView)
        await sleep(5000)
        await clickMCPCloseButton(webviewView)
    })
})
