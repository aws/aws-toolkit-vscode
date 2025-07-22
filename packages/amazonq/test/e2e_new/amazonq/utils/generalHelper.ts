/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { By, WebviewView, WebElement } from 'vscode-extension-tester'
import { until } from 'selenium-webdriver'

/**
 * Waits for an element to be located, if there are multiple elements with the same locator it will just return the first one
 * @param webview The WebviewView instance
 * @param locator The selenium locator
 * @param timeout The timeout in milliseconds (Optional)
 * @returns Promise<WebElement> Returns the element found
 */
export async function waitForElement(webview: WebviewView, locator: By, timeout?: number): Promise<WebElement> {
    const driver = webview.getDriver()
    await driver.wait(until.elementsLocated(locator), timeout)
    return await webview.findWebElement(locator)
}

/**
 * Waits for multiple elements with the same css selector to be located
 * @param webview The WebviewView instance
 * @param locator The selenium locator
 * @param timeout The timeout in milliseconds (Optional)
 * @returns Promise<WebElement[]> Returns an array of elements found
 */
export async function waitForElements(webview: WebviewView, locator: By, timeout?: number): Promise<WebElement[]> {
    const driver = webview.getDriver()
    await driver.wait(until.elementsLocated(locator), timeout)
    return await webview.findWebElements(locator)
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

/**
 * General sleep function to wait for a specified amount of time
 * @param timeout Time in miliseconds
 */
export async function sleep(timeout: number) {
    await new Promise((resolve) => setTimeout(resolve, timeout))
}
