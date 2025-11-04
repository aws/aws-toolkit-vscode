/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { WebviewView, By } from 'vscode-extension-tester'
import { clickButton, sleep, findMynahCardsBody, findItemByText } from '../utils/generalUtils'
/**
 * Clicks the tools to get to the MCP server overlay
 * @param webviewView The WebviewView instance
 * @returns Promise<boolean> True if tools button was found and clicked, false otherwise
 */
export async function addNewChatTab(webviewView: WebviewView): Promise<void> {
    try {
        await clickButton(
            webviewView,
            '[data-testid="tab-bar-wrapper"]',
            '[data-testid="tab-bar-tab-add-button"] .mynah-ui-icon-plus',
            'add chat button'
        )
    } catch (e) {
        throw new Error(`Failed to add new chat tab`)
    }
}

export async function verifyMaxTabsTooltip(webviewView: WebviewView): Promise<void> {
    // Get + icon element first
    const addChatButton = await webviewView.findWebElement(By.css('.mynah-ui-icon-plus'))

    // Move cursor away from + icon by hovering on body element
    const body = await webviewView.findWebElement(By.css('body'))
    await webviewView.getDriver().actions().move({ origin: body, x: 50, y: 50 }).perform()
    await sleep(500)

    // Hover back on + icon to trigger tooltip
    await webviewView.getDriver().actions().move({ origin: addChatButton }).perform()
    await sleep(500)

    try {
        const tooltip = await webviewView.findWebElement(By.css('.mynah-nav-tabs-max-reached-overlay'))
        const tooltipText = await tooltip.getText()
        const expectedText = 'You can only open ten conversation tabs at a time.'

        if (!tooltipText.includes(expectedText)) {
            throw new Error(`Expected tooltip text not found. Expected: ${expectedText}, Got: ${tooltipText}`)
        }
    } catch (e) {
        console.log('✗ Tooltip element not found')
        throw e
    }
}

export async function verifyAmazonQResponse(webviewView: WebviewView): Promise<void> {
    const list = await findMynahCardsBody(webviewView)
    await sleep(500)
    await findItemByText(list, "Hello! I'm Amazon Q")
}
