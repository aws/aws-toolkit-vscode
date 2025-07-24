/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { WebviewView, By } from 'vscode-extension-tester'
import { waitForElement } from '../utils/generalUtils'

/**
 * Clicks the Rules button in the top bar
 * @param webviewView The WebviewView instance
 */
export async function clickRulesButton(webviewView: WebviewView): Promise<void> {
    const wrapper = await webviewView.findElement(By.css('.mynah-chat-prompt-wrapper'))
    const topBar = await wrapper.findElement(By.css('.mynah-prompt-input-top-bar'))
    console.log('THIS WORKS 1')
    const buttons = await topBar.findElement(By.css('[data-testid="prompt-input-top-bar-button"]'))
    console.log('THIS WORKS 2')
    const button = await buttons.findElement(By.css('*'))
    console.log('THIS WORKS 3')
    await button.click()
}

/**
 * Creates a new rule with the specified name
 * @param webviewView The WebviewView instance
 * @param ruleName The name of the rule to create (defaults to "testRule")
 */
export async function createRule(webviewView: WebviewView, ruleName: string = 'testRule'): Promise<void> {
    const overlay = await waitForElement(webviewView, By.css('[data-testid="prompt-input-top-bar-action-overlay"]'))
    const create = overlay.findElement(By.css('[data-testid="prompt-input-quick-pick-item"]'))
    await create.click()
    const anotheroverlay = await waitForElement(webviewView, By.css('[data-testid="sheet-wrapper"]'))
    const input = await anotheroverlay.findElement(By.css('[data-testid="chat-item-form-item-text-input"]'))
    await input.sendKeys(ruleName)
    await clickCreateRule(webviewView)
}

/**
 * Clicks the Create button in the rule creation dialog
 * @param webviewView The WebviewView instance
 */
export async function clickCreateRule(webviewView: WebviewView): Promise<void> {
    const anotheroverlay = await waitForElement(webviewView, By.css('[data-testid="sheet-wrapper"]'))
    const buttonsContainer = await anotheroverlay.findElement(By.css('[data-testid="chat-item-buttons-wrapper"]'))
    const button = await buttonsContainer.findElements(By.css('[data-testid="chat-item-action-button"]'))
    await button[1].click()
}

/**
 * Clicks the Cancel button in the rule creation dialog
 * @param webviewView The WebviewView instance
 */
export async function clickCancelRule(webviewView: WebviewView): Promise<void> {
    const anotheroverlay = await waitForElement(webviewView, By.css('[data-testid="sheet-wrapper"]'))
    const buttonsContainer = await anotheroverlay.findElement(By.css('[data-testid="chat-item-buttons-wrapper"]'))
    const button = await buttonsContainer.findElements(By.css('[data-testid="chat-item-action-button"]'))
    await button[0].click()
}
