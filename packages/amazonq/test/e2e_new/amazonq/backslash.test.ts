/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import './utils/setup'
import { By, WebviewView } from 'vscode-extension-tester'
import { closeAllTabs, dismissOverlayIfPresent } from './framework/cleanupHelper'
import { testContext } from './utils/testContext'
import { writeToChat } from './framework/chatHelper'
import { waitForElement } from './framework/generalHelper'

describe('Amazon Q Chat Backslash Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(150000)
    let webviewView: WebviewView

    before(async function () {
        webviewView = testContext.webviewView!
    })

    after(async () => {
        await closeAllTabs(webviewView)
    })

    afterEach(async () => {
        // before closing the tabs, make sure that any overlays have been dismissed
        await dismissOverlayIfPresent(webviewView)
    })

    it('Backslash Test', async () => {
        // type "/" but don't send in order to trigger the overlay menu
        await writeToChat('/', webviewView, false)
        await new Promise((resolve) => setTimeout(resolve, 2000))

        /* NOTE: do NOT look for the container first because the overlay will disappear on a click,
        instead, we should just look for the clickable overlay menu items directly and click them
        one by one for the test. */
        const menuItems = await waitForElement(
            webviewView,
            By.css('.mynah-detailed-list-item.mynah-ui-clickable-item.target-command'),
            true,
            10000
        )
        console.log(`Found ${menuItems.length} backslash command items`)

        // get text of each menu item before clicking any of them
        const menuTexts = []
        for (let i = 0; i < menuItems.length; i++) {
            try {
                const text = await menuItems[i].getText()
                menuTexts.push(text)
                console.log(`Command ${i + 1}: ${text}`)
            } catch (e) {
                console.log(`Could not get text for command ${i + 1}`)
            }
        }

        if (menuItems.length > 0) {
            console.log(`Clicking on command: ${menuTexts[0] || 'unknown'}`)
            await menuItems[0].click()

            // wait for the command to process
            await new Promise((resolve) => setTimeout(resolve, 3000))
            console.log('Command clicked successfully')
        } else {
            console.log('No backslash commands found to click')
        }
    })
})
