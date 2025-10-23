/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { By, WebviewView } from 'vscode-extension-tester'
import { testContext } from '../utils/testContext'
import {
    clickMCPAddButton,
    clickMCPCloseButton,
    configureMCPServer,
    saveMCPServerConfiguration,
    clickToolsButton,
    findMCPListItems,
    checkMCPServerStatus,
    clickMCPRefreshButton,
    validateToolPermissions,
    validateMCPDropdownOptions,
    configureRemoteMCPServer,
    remoteFetchConfig,
    updateMCPTimeout,
    clickMCPEditButton,
    updateMCPCommand,
    clickMCPFixConfigurationButton,
    checkMCPServerErrorStatus,
} from '../helpers/mcpHelper'
import { closeAllTabs } from '../utils/cleanupUtils'
import { findItemByText, sleep } from '../utils/generalUtils'

describe('Amazon Q MCP Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(150000)
    let webviewView: WebviewView

    before(async function () {
        webviewView = testContext.webviewView
    })

    afterEach(async function () {
        await clickMCPCloseButton(webviewView)
        await closeAllTabs(webviewView)
    })

    it('Test Amazon Q MCP Servers Access', async () => {
        await clickToolsButton(webviewView)
    })

    it('Add new MCP Server', async () => {
        await clickToolsButton(webviewView)
        let mcpExists = false
        try {
            const list = await findMCPListItems(webviewView)
            await findItemByText(list, 'aws-documentation')
            mcpExists = true
        } catch {}

        if (!mcpExists) {
            await clickMCPAddButton(webviewView)
            await configureMCPServer(webviewView)
            await saveMCPServerConfiguration(webviewView)
            await clickMCPCloseButton(webviewView)
            await clickToolsButton(webviewView)
            const list = await findMCPListItems(webviewView)
            await findItemByText(list, 'aws-documentation')
        }
    })

    it('Refresh MCP Server', async () => {
        await clickToolsButton(webviewView)
        await clickMCPRefreshButton(webviewView)
    })

    it('Test MCP Server status', async () => {
        await clickToolsButton(webviewView)
        const list = await findMCPListItems(webviewView)
        await findItemByText(list, 'aws-documentation')
        await checkMCPServerStatus(webviewView)
    })

    it('Test MCP Tool permission default', async () => {
        await clickToolsButton(webviewView)
        const mcpItems = await findMCPListItems(webviewView)
        await (await findItemByText(mcpItems, 'aws-documentation')).click()
        await validateToolPermissions(webviewView)
    })

    it('Test MCP Tool Dropdowns', async () => {
        await clickToolsButton(webviewView)
        const mcpItems = await findMCPListItems(webviewView)
        await (await findItemByText(mcpItems, 'aws-documentation')).click()
        try {
            await (await webviewView.findWebElement(By.css('.mynah-ui-icon-down-open'))).click()
        } catch (e) {
            throw new Error('Error clicking dropdown button')
        }
        await validateMCPDropdownOptions(webviewView, ['Ask', 'Always allow', 'Deny'])
        await clickMCPCloseButton(webviewView)
    })

    it('Add new Remote MCP Server', async () => {
        await clickToolsButton(webviewView)
        let mcpExists = false
        try {
            const list = await findMCPListItems(webviewView)
            await findItemByText(list, 'remote-fetch')
            mcpExists = true
        } catch {}

        if (!mcpExists) {
            await clickMCPAddButton(webviewView)
            await configureRemoteMCPServer(webviewView, remoteFetchConfig)
            await saveMCPServerConfiguration(webviewView)
            await clickMCPCloseButton(webviewView)
            await clickToolsButton(webviewView)
            const list = await findMCPListItems(webviewView)
            await findItemByText(list, 'remote-fetch')
        }
    })

    it('Edit Remote MCP Server timeout', async () => {
        await clickToolsButton(webviewView)
        const list = await findMCPListItems(webviewView)
        await (await findItemByText(list, 'remote-fetch')).click()
        await sleep(100)
        await clickMCPEditButton(webviewView)
        await updateMCPTimeout(webviewView, 60)
        await saveMCPServerConfiguration(webviewView)
    })

    it('Edit MCP Server with Fault Automation', async () => {
        await clickToolsButton(webviewView)
        const list = await findMCPListItems(webviewView)
        await (await findItemByText(list, 'aws-documentation')).click()
        await sleep(100)
        await clickMCPEditButton(webviewView)
        await updateMCPCommand(webviewView, 'uv')
        await saveMCPServerConfiguration(webviewView)
        await clickMCPCloseButton(webviewView)
        await clickToolsButton(webviewView)
        await checkMCPServerErrorStatus(webviewView, 'aws-documentation')
        await clickMCPFixConfigurationButton(webviewView)
        await updateMCPCommand(webviewView, 'uvx')
        await saveMCPServerConfiguration(webviewView)
    })
})
