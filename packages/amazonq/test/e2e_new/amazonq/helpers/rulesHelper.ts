/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { WebviewView, By } from 'vscode-extension-tester'

/**
 * Clicks the tools to get to the MCP server overlay
 * @param webviewView The WebviewView instance
 * @returns Promise<boolean> True if tools button was found and clicked, false otherwise
 */
export async function clickRulesButton(webviewView: WebviewView): Promise<void> {
    const buttons = await webviewView.findElements(
        By.css('.mynah-button.mynah-button-secondary.fill-state-always.status-clear.mynah-ui-clickable-item')
    )
    for (const button of buttons) {
        const span = await button.findElement(By.css('span'))
        const text = await span.getText()
        if (text === 'Rules') {
            await button.click()
            return
        }
    }
    throw new Error('Rules button not found')
}
