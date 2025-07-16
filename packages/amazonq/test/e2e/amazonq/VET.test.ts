/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Workbench, By, WebviewView, WebElement } from 'vscode-extension-tester'
import { until } from 'selenium-webdriver'

describe('Amazon Q E2E UI Test', function () {
    // need this timeout because Amazon Q takes awhile to load

    // need this timeout
    this.timeout(150000)
    let webviewView: WebviewView
    let workbench: Workbench
    before(async function () {
        /* TO-DO 
        possibly before the workbench executes Amazon Q: Open Chat, we can make sure that all the tabs are closed first*/
        workbench = new Workbench()
        await workbench.executeCommand('Amazon Q: Open Chat')

        // need this timeout
        await new Promise((resolve) => setTimeout(resolve, 5000))
        webviewView = new WebviewView()
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
        // need this timeout
        await new Promise((resolve) => setTimeout(resolve, 12000))
        console.log('Manual authentication should be done')
        await webviewView.switchBack()

        // AFTER AUTHENTICATION WE MUST RELOAD THE WEBVIEW BECAUSE MULTIPLE WEVIEWS CANNOT BE READ AT THE SAME TIME
        const editorView = workbench.getEditorView()
        console.log('editorview successfully created')
        await editorView.closeAllEditors()
        console.log('Closed all editors')
        webviewView = new WebviewView()
        console.log('Reopened webview view')
        await webviewView.switchToFrame()
    })

    after(async () => {
        /* 
        mynah-tabs-container is the css that contains all the mynah ui tabs
        inside that there are two spans that have key values
        inside those spans there is a div with the css mynah-tab-item-label
        and finally INSIDE THAT there is a button with the css mynah-tabs-close-button, we need to click that button and close all the tabs after the test is done

        Logic:
        Find all the tahs by looking for the close buttons and then close them one by one. To check if all the tabs are closed, we can check if the mynah-tabs-container is empty.
        */
        try {
            const closeButtons = await webviewView.findWebElements(By.css('.mynah-tabs-close-button'))

            for (const button of closeButtons) {
                await button.click()
                await new Promise((resolve) => setTimeout(resolve, 500))
            }

            // double check that all tabs are closed by checking if the mynah-tabs-container is empty
            const tabsContainer = await webviewView.findWebElements(By.css('.mynah-tabs-container'))
            if (
                tabsContainer.length === 0 ||
                (await tabsContainer[0].findElements(By.css('.mynah-tab-item-label'))).length === 0
            ) {
                console.log('All chat tabs successfully closed')
            }
        } catch (error) {
            console.log('Error closing tabs:', error)
        }
        await webviewView.switchBack()
    })

    it('Chat Prompt Test', async () => {
        const chatInput = await waitForElement(webviewView, By.css('.mynah-chat-prompt-input'))
        await chatInput.sendKeys('Hello, Amazon Q!')
        const sendButton = await waitForElement(webviewView, By.css('.mynah-chat-prompt-button'))
        await sendButton.click()
        const responseReceived = await waitForChatResponse(webviewView)
        if (!responseReceived) {
            throw new Error('Chat response not received within timeout')
        }

        console.log('Chat response detected successfully')
    })

    // Helper to wait for ui elements to load, utilizes typescript function overloading to account for all possible edge cases
    async function waitForElement(
        webview: WebviewView,
        locator: By,
        multiple: true,
        timeout?: number
    ): Promise<WebElement[]>
    async function waitForElement(
        webview: WebviewView,
        locator: By,
        multiple?: false,
        timeout?: number
    ): Promise<WebElement>
    async function waitForElement(
        webview: WebviewView,
        locator: By,
        multiple = false,
        timeout = 15000
    ): Promise<WebElement | WebElement[]> {
        const driver = webview.getDriver()
        await driver.wait(until.elementsLocated(locator), timeout)
        return multiple ? await webview.findWebElements(locator) : await webview.findWebElement(locator)
    }

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

    /*  My Idea: Basically the conversation container's css is .mynah-chat-items-conversation-container
        Instead of looking for a specific message like how we look for other elements in the test,
        I can check how many elements there are in our specific conversation container. If there is 2 elements,
        we can assume that the chat response has been generated. The challenge is, we must grab the latest
        conversation container, as there can be multiple conversations in the webview. */
    async function waitForChatResponse(webview: WebviewView, timeout = 15000): Promise<boolean> {
        const startTime = Date.now()

        while (Date.now() - startTime < timeout) {
            const conversationContainers = await webview.findWebElements(
                By.css('.mynah-chat-items-conversation-container')
            )

            if (conversationContainers.length > 0) {
                const latestContainer = conversationContainers[conversationContainers.length - 1]

                const chatItems = await latestContainer.findElements(By.css('*'))

                if (chatItems.length >= 2) {
                    return true
                }
            }
            await new Promise((resolve) => setTimeout(resolve, 500))
        }

        return false
    }
})
