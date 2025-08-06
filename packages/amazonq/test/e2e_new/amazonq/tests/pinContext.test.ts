/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { WebviewView, By } from 'vscode-extension-tester'
import { closeAllTabs, dismissOverlayIfPresent } from '../utils/cleanupUtils'
import { testContext } from '../utils/testContext'
import { clickPinContextButton, clickPinContextMenuItem, clickSubMenuItem } from '../helpers/pinContextHelper'
import { waitForElement } from '../utils/generalUtils'

describe('Amazon Q Pin Context Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(150000)
    let webviewView: WebviewView

    before(async function () {
        webviewView = testContext.webviewView
    })

    afterEach(async () => {
        await dismissOverlayIfPresent(webviewView)
        await closeAllTabs(webviewView)
    })
    it('File Context Test', async () => {
        await clickPinContextButton(webviewView)
        await clickPinContextMenuItem(webviewView, 'Files')
        await clickPinContextMenuItem(webviewView, 'Active file')
    })
    it('Pin Context Test', async () => {
        await clickPinContextButton(webviewView)
        await clickPinContextMenuItem(webviewView, '@workspace')
    })
    it('Prompts Context Test', async () => {
        await clickPinContextButton(webviewView)
        await clickPinContextMenuItem(webviewView, 'Prompts')
        const addPrompt = await waitForElement(webviewView, By.css('.mynah-ui-icon.mynah-ui-icon-list-add'))
        await addPrompt.click()
        const chatInput = await waitForElement(webviewView, By.css('[data-testid="chat-item-form-item-text-input"]'))
        await chatInput.sendKeys('test')
        const createPrompt = await waitForElement(
            webviewView,
            By.css('.mynah-button.fill-state-always.status-primary.mynah-ui-clickable-item')
        )
        await createPrompt.click()
        await clickPinContextButton(webviewView)
        await clickPinContextMenuItem(webviewView, 'Prompts')
        await clickSubMenuItem(webviewView, 'test')
    })
})
