/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Workbench, By, WebviewView } from 'vscode-extension-tester'
import { waitForElement, findItemByText } from './generalHelper'

/* Completes the entire Amazon Q login flow

Currently, the function will
1. Open AmazonQ
2. Clicks Company Account
3. Inputs the Start URL
4. IMPORTANT: you must click manually open yourself when the popup window asks to open the browser and complete the authentication in the browser** 

TO-DO: Currently this loginToAmazonQ is not fully autonomous as we ran into a blocker when the browser window pops up
Documentation: https://quip-amazon.com/PoJOAyt4ja8H/Authentication-for-UI-Tests-Documentation */

export async function loginToAmazonQ(): Promise<{ workbench: Workbench; webviewView: WebviewView }> {
    const workbench = new Workbench()
    await workbench.executeCommand('Amazon Q: Open Chat')

    await new Promise((resolve) => setTimeout(resolve, 5000))
    let webviewView = new WebviewView()
    await webviewView.switchToFrame()

    const selectableItems = await waitForElement(webviewView, By.css('.selectable-item'), true)
    if (selectableItems.length === 0) {
        throw new Error('No selectable login options found')
    }

    const companyItem = await findItemByText(selectableItems, 'Company account')
    await companyItem.click()
    const signInContinue = await webviewView.findWebElement(By.css('#connection-selection-continue-button'))
    await signInContinue.click()
    const startUrlInput = await webviewView.findWebElement(By.id('startUrl'))
    await startUrlInput.clear()
    await startUrlInput.sendKeys('https://amzn.awsapps.com/start')
    const UrlContinue = await webviewView.findWebElement(By.css('button.continue-button.topMargin'))
    await UrlContinue.click()
    console.log('Waiting for manual authentication...')
    await new Promise((resolve) => setTimeout(resolve, 12000))
    console.log('Manual authentication should be done')
    await webviewView.switchBack()

    const editorView = workbench.getEditorView()
    await editorView.closeAllEditors()
    webviewView = new WebviewView()
    await webviewView.switchToFrame()

    return { workbench, webviewView }
}
