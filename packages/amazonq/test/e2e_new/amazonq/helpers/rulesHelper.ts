/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { WebviewView, By } from 'vscode-extension-tester'
import { clickButton, sleep, waitForElement } from '../utils/generalUtils'

/**
 * Clicks the Rules button in the top bar
 * @param webview The WebviewView instance
 */
export async function clickRulesButton(webview: WebviewView): Promise<void> {
    await clickButton(
        webview,
        '[data-testid="prompt-input-top-bar-button"]',
        '.mynah-ui-icon-check-list',
        'Rules button'
    )
}

/**
 * Clicks on "Create a new rule" option from the rules menu
 * @param webview The WebviewView instance
 */
export async function clickCreateNewRuleOption(webview: WebviewView): Promise<void> {
    // needs a bit of time because the overlay has to load
    await sleep(10000)
    const overlayContainer = await waitForElement(webview, By.css('.mynah-overlay-container'))
    const quickPickItems = await overlayContainer.findElements(By.css('[data-testid="prompt-input-quick-pick-item"]'))

    if (quickPickItems.length === 0) {
        throw new Error('No quick pick items found')
    }
    const lastItem = quickPickItems[quickPickItems.length - 1]
    const bdiElement = await lastItem.findElement(By.css('.mynah-detailed-list-item-description.ltr bdi'))
    const text = await bdiElement.getText()

    if (text.trim() !== 'Create a new rule') {
        throw new Error(`Expected "Create a new rule" but found "${text}"`)
    }
    await lastItem.click()
}

/**
 * Enters a rule name in the rule creation form
 * @param webview The WebviewView instance
 * @param ruleName The name of the rule
 */
export async function enterRuleName(webview: WebviewView, ruleName: string): Promise<void> {
    // needs a bit of time because the overlay has to load
    await sleep(1000)
    const sheetWrapper = await waitForElement(webview, By.css('[data-testid="sheet-wrapper"]'))
    const ruleNameInput = await sheetWrapper.findElement(By.css('[data-testid="chat-item-form-item-text-input"]'))

    await ruleNameInput.clear()
    await ruleNameInput.sendKeys(ruleName)
}

/**
 * Clicks the Create button in the rule creation form
 * @param webview The WebviewView instance
 */
export async function clickCreateButton(webview: WebviewView): Promise<void> {
    const sheetWrapper = await waitForElement(webview, By.css('[data-testid="sheet-wrapper"]'))
    const createButton = await sheetWrapper.findElement(By.xpath('.//button[@action-id="submit-create-rule"]'))

    await webview.getDriver().wait(
        async () => {
            const isDisabled = await createButton.getAttribute('disabled')
            return isDisabled === null
        },
        5000,
        'Create button did not become enabled'
    )

    await createButton.click()
}

/**
 * Clicks the Cancel button in the rule creation form
 * @param webview The WebviewView instance
 */
export async function clickCancelButton(webview: WebviewView): Promise<void> {
    const sheetWrapper = await waitForElement(webview, By.css('[data-testid="sheet-wrapper"]'))
    const cancelButton = await sheetWrapper.findElement(By.xpath('.//button[@action-id="cancel-create-rule"]'))
    await cancelButton.click()
}

/**
 * Creates a new rule with the specified name (complete workflow)
 * @param webview The WebviewView instance
 * @param ruleName The name of the rule to create
 */
export async function createNewRule(webview: WebviewView, ruleName: string): Promise<void> {
    await clickRulesButton(webview)
    await clickCreateNewRuleOption(webview)
    await enterRuleName(webview, ruleName)
    await clickCreateButton(webview)
}
