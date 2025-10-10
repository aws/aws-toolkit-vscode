/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { WebviewView, By } from 'vscode-extension-tester'
import { clickButton, sleep, waitForElement } from '../utils/generalUtils'

/**
 * Hovers on button and validates tooltip
 * @param webviewView The WebviewView instance
 * @param buttonSelector CSS selector for the button
 * @param expectedTooltip Expected tooltip text
 */
export async function hoverButtonAndValidateTooltip(
    webviewView: WebviewView,
    buttonSelector: string,
    expectedTooltip: string
): Promise<void> {
    try {
        const button = await waitForElement(webviewView, By.css(buttonSelector))
        const actions = webviewView.getDriver().actions()
        await actions.move({ origin: button }).perform()
        await sleep(2000)

        const allElements = await webviewView.findWebElements(By.css('*'))
        await sleep(1000)
        for (const element of allElements) {
            const text = await element.getText()
            if (text.includes(expectedTooltip)) {
                console.log('Success: Found expected tooltip text')
                return
            }
        }
        throw new Error(`Expected tooltip "${expectedTooltip}" not found`)
    } catch (e) {
        throw new Error('Button not found or tooltip unavailable')
    }
}

/**
 * Clicks the reject shell command button
 * @param webviewView The WebviewView instance
 */
export async function rejectShellCommand(webviewView: WebviewView): Promise<void> {
    try {
        await clickButton(
            webviewView,
            '[data-testid="chat-item-buttons-wrapper"]',
            '[action-id="reject-shell-command"] .mynah-ui-icon-cancel',
            'reject button',
            true
        )
    } catch (e) {
        throw new Error(`Failed to reject shell command: ${e}`)
    }
}

/**
 * Clicks the run shell command button
 * @param webviewView The WebviewView instance
 */
export async function runShellCommand(webviewView: WebviewView): Promise<void> {
    try {
        await clickButton(
            webviewView,
            '[data-testid="chat-item-buttons-wrapper"]',
            '[action-id="run-shell-command"] .mynah-ui-icon-play',
            'run button',
            true
        )
    } catch (e) {
        throw new Error(`Failed to run shell command: ${e}`)
    }
}

/**
 * Clicks the stop shell command button
 * @param webviewView The WebviewView instance
 */
export async function stopShellCommand(webviewView: WebviewView): Promise<void> {
    try {
        await clickButton(
            webviewView,
            '.mynah-chat-prompt-button-wrapper',
            '[data-testid="prompt-input-send-button"] .mynah-ui-icon-stop',
            'stop button'
        )
    } catch (e) {
        throw new Error(`Failed to stop shell command: ${e}`)
    }
}

/**
 * Waits for loading to complete
 * @param webviewView The WebviewView instance
 * @param maxWait Maximum wait time in milliseconds (default: 30000)
 */
export async function waitForLoadingComplete(webviewView: WebviewView, maxWait: number = 30000): Promise<void> {
    const startTime = Date.now()
    while (Date.now() - startTime < maxWait) {
        try {
            const loadingElements = await webviewView.findWebElements(By.css('.mynah-chat-wrapper.loading'))
            if (loadingElements.length === 0) {
                break
            }
        } catch (e) {
            // Continue waiting
        }
        await sleep(1000)
    }
}
