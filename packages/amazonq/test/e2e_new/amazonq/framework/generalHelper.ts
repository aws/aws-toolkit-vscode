/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { By, WebviewView, WebElement } from 'vscode-extension-tester'
import { until } from 'selenium-webdriver'

/* Waits for an element (or multiple elements) to appear based on the parameters

Logic:
The function utilizes the Selenium wait driver. We can call that driver from our
WebviewView but it can also be called on parts of the VSCode Editor that are not
part of the WebviewView.

(TO-DO: create a more general function that can be called on any part of the VSCode
Editor. Will do when a use case appears for it.*/

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

/* General function for finding WebElement by their text content

Logic:
It searches through an array of WebElements and looks for an element with 
the ".tittle" CSS class within each item. Compares the text content and returns
the first matching parent element, or throws an error if not found. */

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
