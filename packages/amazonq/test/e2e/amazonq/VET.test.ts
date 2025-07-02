/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Workbench, By, EditorView, WebviewView, WebElement } from 'vscode-extension-tester'

describe('Amazon Q Login Flow', function () {
    // need this timeout because Amazon Q takes awhile to load
    this.timeout(30000)
    let webviewView: WebviewView

    // NOTE: I tested all the timeouts and they are necessary for the webview to load properly
    before(async function () {
        const workbench = new Workbench()
        await workbench.executeCommand('Amazon Q: Open Chat')

        await new Promise((resolve) => setTimeout(resolve, 15000))
        webviewView = new WebviewView()

        try {
            await webviewView.switchToFrame()
        } catch (e) {
            console.log('WE HIT AN ERROR OPEENING THE FRAME')
            console.log(e)
        }
    })

    after(async () => {
        await webviewView.switchBack()
        try {
            await new EditorView().closeAllEditors()
        } catch {}
    })

    it('Should click through the Amazon Q login screen', async () => {
        // Select company account option
        const selectableItems = await webviewView.findWebElements(By.css('.selectable-item'))
        console.log(typeof selectableItems)
        if (selectableItems.length === 0) {
            throw new Error('No selectable login options found')
        }

        // Find and click company account
        const companyItem = await findItemByText(selectableItems, 'Company account')
        await companyItem.click()
        await new Promise((resolve) => setTimeout(resolve, 2000))

        // Click first continue button
        const signInContinue = await webviewView.findWebElement(By.css('#connection-selection-continue-button'))
        await signInContinue.click()
        await new Promise((resolve) => setTimeout(resolve, 2000))

        // Enter start URL
        const startUrlInput = await webviewView.findWebElement(By.id('startUrl'))
        await startUrlInput.clear()
        await startUrlInput.sendKeys('https://amzn.awsapps.com/start')
        await new Promise((resolve) => setTimeout(resolve, 1000))

        // Click second continue button
        const UrlContinue = await webviewView.findWebElement(By.css('button.continue-button.topMargin'))
        await UrlContinue.click()
        await new Promise((resolve) => setTimeout(resolve, 2000))
    })

    // Helper to find item by text content
    async function findItemByText(items: WebElement[], text: string) {
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
})
