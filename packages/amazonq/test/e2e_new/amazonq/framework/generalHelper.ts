/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { By, WebviewView, WebElement } from 'vscode-extension-tester'
import { until } from 'selenium-webdriver'

/* Note: If multiple is set to False, then it will return the first element it finds that matches the Locator*/
export async function waitForElement(
    webview: WebviewView,
    locator: By,
    multiple: true,
    timeout?: number
): Promise<WebElement[]>
export async function waitForElement(
    webview: WebviewView,
    locator: By,
    multiple?: false,
    timeout?: number
): Promise<WebElement>
export async function waitForElement(
    webview: WebviewView,
    locator: By,
    multiple = false,
    timeout = 15000
): Promise<WebElement | WebElement[]> {
    const driver = webview.getDriver()
    await driver.wait(until.elementsLocated(locator), timeout)
    return multiple ? await webview.findWebElements(locator) : await webview.findWebElement(locator)
}

export async function findItemByText(items: WebElement[], text: string) {
    for (const item of items) {
        const titleDivs = await item.findElements(By.css('.title'))
        for (const titleDiv of titleDivs) {
            const titleText = await titleDiv.getText()
            if (titleText?.trim().startsWith(text)) {
                return item
            }
        }
    }
    throw new Error(`Item with text "${text}" not found`)
}
