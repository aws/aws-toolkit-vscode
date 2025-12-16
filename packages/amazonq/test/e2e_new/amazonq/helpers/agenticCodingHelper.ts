/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { WebviewView, By } from 'vscode-extension-tester'
import { waitForElement, pressKey, sleep } from '../utils/generalUtils'

/**
 * Toggles the agentic chat switch
 * @param webviewView The WebviewView instance
 */
export async function toggleAgenticChat(webviewView: WebviewView): Promise<void> {
    try {
        const agenticChat = await waitForElement(webviewView, By.css('.mynah-form-input-switch-check'))
        await agenticChat.click()
    } catch (e) {
        throw new Error('Agentic chat toggle not found')
    }
}

/**
 * Clicks the acknowledge button
 * @param webviewView The WebviewView instance
 */
export async function clickAcknowledgeButton(webviewView: WebviewView): Promise<void> {
    const acknowledgeButton = await webviewView.findWebElement(By.css('.mynah-ui-icon-ok'))
    await acknowledgeButton.click()
}

/**
 * Clicks the AWS Responsible AI Policy link and opens it
 * @param webviewView The WebviewView instance
 */
export async function clickResponsibleAIPolicy(webviewView: WebviewView): Promise<void> {
    try {
        const links = await webviewView.findWebElements({ css: '.mynah-ui-clickable-item' })
        for (const link of links) {
            const text = await link.getText()
            if (text.includes('AWS Responsible AI Policy')) {
                await link.click()
                break
            }
        }
        await pressKey(webviewView.getDriver(), 'ENTER')
    } catch (e) {
        throw new Error('Failed to click AWS Responsible AI Policy link')
    }
}

/**
 * Clicks on the AWS Responsible AI Policy link
 * @param webview The WebviewView instance
 */
export async function clickAWSResponsibleAIPolicy(webview: WebviewView): Promise<void> {
    const links = await webview.findWebElements({ css: '.mynah-ui-clickable-item' })
    let found = false
    for (const link of links) {
        const text = await link.getText()
        if (text.includes('AWS Responsible AI Policy')) {
            await link.click()
            found = true
            break
        }
    }
    if (!found) throw new Error('Failed to click AWS Responsible AI Policy')
    await sleep(500)
    await webview.switchBack()
    const driver = webview.getDriver()
    const openButton = await driver.wait(async () => {
        const buttons = await driver.findElements({ css: 'a.monaco-button' })
        for (const btn of buttons) {
            const text = await btn.getText()
            if (text === 'Open') return btn
        }
        return null
    }, 5000)
    if (!openButton) throw new Error('Open button not found')
    await openButton.click()
    await sleep(1000)
    await webview.switchToFrame()
}
