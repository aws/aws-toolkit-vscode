/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { By, WebviewView } from 'vscode-extension-tester'

/* Finds all the tabs by looking for the close buttons and then closes them one by one.

Logic:
There is a button with the css mynah-tabs-close-button, we need to click that button and 
close all the tabs after the test is done to avoid memory from a previous test. To double
check if all the tabs are closed, we can check if the mynah-tabs-container is empty. */

export async function closeAllTabs(webview: WebviewView) {
    try {
        const closeButtons = await webview.findWebElements(By.css('.mynah-tabs-close-button'))

        for (const button of closeButtons) {
            await button.click()
            await new Promise((resolve) => setTimeout(resolve, 500))
        }

        // double check that all tabs are closed by checking if the mynah-tabs-container is empty
        const tabsContainer = await webview.findWebElements(By.css('.mynah-tabs-container'))
        if (
            tabsContainer.length === 0 ||
            (await tabsContainer[0].findElements(By.css('.mynah-tab-item-label'))).length === 0
        ) {
            console.log('All chat tabs successfully closed')
        }
    } catch (error) {
        console.log('Error closing tabs:', error)
    }
}
