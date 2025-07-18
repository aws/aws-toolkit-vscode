/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { By, WebviewView, WebElement } from 'vscode-extension-tester'
import { until } from 'selenium-webdriver'

/**
 * Waits for an element to be located
 * @param webview The WebviewView instance
 * @param locator The selenium locator
 * @param multiple Whether to return multiple elements (Note: If multiple is set to False, then it will return the first element it finds that matches the Locator)
 * @param timeout The timeout in milliseconds
 * @returns Promise<WebElement | WebElement[]> Returns the element or multiple elements that were found
 */
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

/**
 * Finds an item based on the text
 * @param items WebElement array to search
 * @param text The text of the item
 * @returns Promise<WebElement> The first element that contains the specified text
 * TO-DO: Make this function more general by eliminated the By.css('.title')
 */
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
