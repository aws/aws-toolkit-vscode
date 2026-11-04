/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { WebviewView, By } from 'vscode-extension-tester'
import { clickButton, waitForElement, sleep, findMynahCardsBody, findItemByText } from '../utils/generalUtils'

export async function viewHistoryTab(webviewView: WebviewView): Promise<void> {
    try {
        await clickButton(
            webviewView,
            '[data-testid="tab-bar-buttons-wrapper"]',
            '[data-testid="tab-bar-button"] .mynah-ui-icon-history',
            'history button'
        )
    } catch (e) {
        throw new Error(`Failed to view history tab`)
    }
}

export async function waitForHistoryList(webviewView: WebviewView): Promise<void> {
    await waitForElement(webviewView, By.css('.mynah-detailed-list-item-groups-wrapper'))
}

export async function closeHistoryTab(webviewView: WebviewView): Promise<void> {
    try {
        await clickButton(
            webviewView,
            '.mynah-sheet-header',
            '[data-testid="sheet-close-button"] .mynah-ui-icon-cancel',
            'history button'
        )
    } catch (e) {
        throw new Error(`Failed to close history tab`)
    }
}

export async function verifyAmazonQResponse(webviewView: WebviewView): Promise<void> {
    const list = await findMynahCardsBody(webviewView)
    await sleep(500)
    await findItemByText(list, "Hello! I'm Amazon Q")
}

export async function selectHistoryItemAndVerify(webviewView: WebviewView): Promise<void> {
    const list = await webviewView.findWebElements(By.css('.mynah-detailed-list-item'))
    await sleep(5000)
    const helloItem = await findItemByText(list, 'Hello, Amazon Q!')
    await helloItem.click()
    await sleep(500)
    await verifyAmazonQResponse(webviewView)
}

export async function exportChat(webviewView: WebviewView): Promise<void> {
    try {
        const exportChat = await webviewView.findWebElement(By.css('.mynah-ui-icon-external'))
        await exportChat.click()
    } catch (e) {
        throw new Error(`Failed to export chat`)
    }
}

export async function viewAmazonLog(webviewView: WebviewView): Promise<void> {
    try {
        const exportChat = await webviewView.findWebElement(By.css('.mynah-ui-icon-file'))
        await exportChat.click()
    } catch (e) {
        throw new Error(`Failed to click on Amazon log icon`)
    }
}
