/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { WebviewView, By } from 'vscode-extension-tester'
import { sleep, waitForElement } from '../utils/generalUtils'

export async function clickToolsButton(webviewView: WebviewView): Promise<boolean> {
    try {
        const menuList = await waitForElement(webviewView, By.css('.mynah-nav-tabs-wrapper.mynah-ui-clickable-item'))
        const menuListItem = await menuList.findElement(By.css('.mynah-nav-tabs-bar-buttons-wrapper'))
        const menuListItems = await menuListItem.findElements(
            By.css('.mynah-button.mynah-button-secondary.fill-state-always.mynah-ui-clickable-item')
        )
        for (const item of menuListItems) {
            const icon = await item.findElement(By.css('i.mynah-ui-icon.mynah-ui-icon-tools'))
            if (icon) {
                await item.click()
                return true
            }
        }
        console.log('Tools button not found')
        return false
    } catch (e) {
        console.error('Error clicking tools button:', e)
        return false
    }
}

export async function clickMCPCloseButton(webviewView: WebviewView): Promise<boolean> {
    try {
        const menuList = await waitForElement(webviewView, By.id('mynah-sheet-wrapper'))
        console.log('THIS WORKS 1')
        sleep(5000)
        const menuu = await menuList.findElement(By.css('.mynah-sheet-header'))
        console.log('THIS WORKS 2')
        sleep(5000)
        const menuListItems = await menuu.findElement(
            By.css('.mynah-button.mynah-button-secondary.fill-state-always.mynah-ui-clickable-item')
        )
        console.log('THIS WORKS 3')
        sleep(5000)
        await menuListItems.click()
        console.log('THIS WORKS 4')
        sleep(5000)
        // for (const item of menuListItems) {
        //     const icon = await item.findElement(By.css('i.mynah-ui-icon.mynah-ui-icon-cancel'))
        //     console.log('THIS WORKS 4')
        //     if (icon) {
        //         await webviewView.getDriver().executeScript('arguments[0].click()', item)
        //         sleep(5000)
        //         return true
        //     }
        // }
        // console.log('I DID NOT ACTUALLY CLICK THE CLOSE BUTTON')
        return true
    } catch (e) {
        console.error('Error closing the MCP overlay:', e)
        return false
    }
}

export async function dismissOverlay(webviewView: WebviewView): Promise<void> {
    await webviewView.getDriver().executeScript('document.elementFromPoint(200, 200).click()')
}
