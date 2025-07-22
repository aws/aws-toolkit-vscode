/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Workbench, By, WebviewView } from 'vscode-extension-tester'
import { findItemByText, sleep, waitForElements } from '../utils/generalHelper'
import { testContext } from '../utils/testContext'

/* Completes the entire Amazon Q login flow

Currently, the function will
1. Open AmazonQ
2. Clicks Company Account
3. Inputs the Start URL
4. IMPORTANT: you must click manually open yourself when the popup window asks to open the browser and complete the authentication in the browser** 

TO-DO: Currently this signInToAmazonQ is not fully autonomous as we ran into a blocker when the browser window pops up */
export async function signInToAmazonQ(): Promise<void> {
    const workbench = new Workbench()
    await workbench.executeCommand('Amazon Q: Open Chat')

    await sleep(5000)
    let webviewView = new WebviewView()
    await webviewView.switchToFrame()

    const selectableItems = await waitForElements(webviewView, By.css('.selectable-item'))
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
    await sleep(12000)
    console.log('Manual authentication should be done')
    await webviewView.switchBack()

    const editorView = workbench.getEditorView()
    await editorView.closeAllEditors()
    webviewView = new WebviewView()
    await webviewView.switchToFrame()

    testContext.workbench = workbench
    testContext.webviewView = webviewView
}

/* NOTE: The workbench and webviewView is grabbed directly from testContext because we are under the assumption that if you want to log out
you've already logged in before. */
export async function signOutFromAmazonQ(workbench: Workbench): Promise<void> {
    await workbench.executeCommand('Amazon Q: Sign Out')
}
