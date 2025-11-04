/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { WebviewView, By } from 'vscode-extension-tester'
import { waitForElement } from '../utils/generalUtils'

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
