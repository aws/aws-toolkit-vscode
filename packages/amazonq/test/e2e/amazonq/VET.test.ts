/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Workbench, By, WebviewView, WebElement } from 'vscode-extension-tester'
import { until } from 'selenium-webdriver'

describe('Amazon Q E2E UI Test', function () {
    // need this timeout because Amazon Q takes awhile to load
    this.timeout(150000)
    let webviewView: WebviewView
    let workbench: Workbench
    // NOTE: I tested all the timeouts and they are necessary for the webview to load properly
    before(async function () {
        this.timeout(120000)
        workbench = new Workbench()
        await workbench.executeCommand('Amazon Q: Open Chat')

        await new Promise((resolve) => setTimeout(resolve, 5000))
        webviewView = new WebviewView()
        await webviewView.switchToFrame()

        const driver = webviewView.getDriver()
        await driver.wait(until.elementsLocated(By.css('.selectable-item')), 30000)
        const selectableItems = await webviewView.findWebElements(By.css('.selectable-item'))
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

        // AFTER AUTHENTICATION WE MUST RELOAD THE WEBVIEW BECAUSE MULTIPLE WEVIEWS CANNOT BE READ AT THE SAME TIME
        const editorView = workbench.getEditorView()
        console.log('editorview successfully created')
        await editorView.closeAllEditors()
        console.log('Closed all editors')
        await new Promise((resolve) => setTimeout(resolve, 1500))
        webviewView = new WebviewView()
        console.log('Reopened webview view')
        await webviewView.switchToFrame()
        await new Promise((resolve) => setTimeout(resolve, 1200))
    })

    after(async () => {
        // TO-DO: Close all the chat windows after the test is done so that when the test runs again it does not have memory
        // from the previous test

        /* 
        mynah-tabs-container is the css that contains all the mynah ui tabs
        inside that there are two spans that have key values
        inside those spans there is a div with the css mynah-tab-item-label
        and finally INSIDE THAT there is a button with the css mynah-tabs-close-button, we need to click that button and close all the tabs after the test is done


        Logic:
        Find all the tahs by looking for the close buttons and then close them one by one. To check if all the tabs are closed, we can check if the mynah-tabs-container is empty.
        */
        try {
            // find all the close buttons and click them
            const closeButtons = await webviewView.findWebElements(By.css('.mynah-tabs-close-button'))

            for (const button of closeButtons) {
                await button.click()
                // small delay to ensure the tab closes properly
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
        const driver = webviewView.getDriver()
        await driver.wait(until.elementsLocated(By.css('.mynah-chat-prompt-input')), 300000)
        // In order to test the chat prompt, we need to find the input field and send keys
        const chatInput = await webviewView.findWebElement(By.css('.mynah-chat-prompt-input'))
        await chatInput.sendKeys('Hello, Amazon Q!')
        await driver.wait(until.elementsLocated(By.css('.mynah-chat-prompt-button')), 300000)
        // In order to submit the chat prompt, we need to find the send button and click it
        const sendButton = await webviewView.findWebElement(By.css('.mynah-chat-prompt-button'))
        await sendButton.click()

        await new Promise((resolve) => setTimeout(resolve, 12000))
        // Wait for response using conversation container check
        const responseReceived = await waitForChatResponse(webviewView)
        if (!responseReceived) {
            throw new Error('Chat response not received within timeout')
        }

        console.log('Chat response detected successfully')
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

    /*  My Idea: Basically the conversation container's css is .mynah-chat-items-conversation-container
        Instead of looking for a specific message like how we look for other elements in the test,
        I can check how many elements there are in our specific conversation container. If there is 2 elements,
        we can assume that the chat response has been generated. The challenge is, we must grab the latest
        conversation container, as there can be multiple conversations in the webview.
*/
    async function waitForChatResponse(webview: WebviewView, timeout = 30000): Promise<boolean> {
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
