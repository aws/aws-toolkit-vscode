/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    By,
    WebviewView,
    WebElement,
    EditorView,
    InputBox,
    Workbench,
    TextEditor,
    Key,
    ActivityBar,
    SideBarView,
} from 'vscode-extension-tester'
import { until, WebDriver } from 'selenium-webdriver'

/**
 * General sleep function to wait for a specified amount of time
 * @param timeout Time in miliseconds
 */
export async function sleep(timeout: number) {
    await new Promise((resolve) => setTimeout(resolve, timeout))
}

/**
 * Waits for an element to be located, if there are multiple elements with the same locator it will just return the first one
 * @param webview The WebviewView instance
 * @param locator The selenium locator
 * @param timeout The timeout in milliseconds (Optional)
 * @returns Promise<WebElement> Returns the element found
 */
export async function waitForElement(webview: WebviewView, locator: By, timeout: number = 8000): Promise<WebElement> {
    const driver = webview.getDriver()
    await driver.wait(until.elementsLocated(locator), timeout)
    return await webview.findWebElement(locator)
}

/**
 * Waits for multiple elements with the same css selector to be located
 * @param webview The WebviewView instance
 * @param locator The selenium locator
 * @param timeout The timeout in milliseconds (Optional)
 * @returns Promise<WebElement[]> Returns an array of elements found
 */
export async function waitForElements(
    webview: WebviewView,
    locator: By,
    timeout: number = 8000
): Promise<WebElement[]> {
    const driver = webview.getDriver()
    await driver.wait(until.elementsLocated(locator), timeout)
    return await webview.findWebElements(locator)
}

/**
 * Robust button clicking function that locates a button by its wrapper and content, then clicks it
 * @param webviewView The WebviewView instance
 * @param buttonWrapperSelector CSS selector for the button's wrapper element
 * @param buttonContentSelector CSS selector for the content inside the button (icon, text, etc.)
 * @param buttonName Descriptive name for the button (used in error messages)
 * @param timeout Timeout in milliseconds (defaults to 5000)
 * @param scrollIntoView Whether to scroll the button into view before clicking (defaults to false)
 * @returns Promise<void>
 */
export async function clickButton(
    webviewView: WebviewView,
    buttonWrapperSelector: string,
    buttonContentSelector: string,
    buttonName: string = 'button',
    timeout: number = 5000
): Promise<void> {
    try {
        const buttonWrapper = await webviewView
            .getDriver()
            .wait(until.elementLocated(By.css(buttonWrapperSelector)), timeout, `${buttonName} wrapper not found`)

        await webviewView
            .getDriver()
            .wait(until.elementIsVisible(buttonWrapper), timeout, `${buttonName} wrapper not visible`)

        const buttonContent = await webviewView
            .getDriver()
            .wait(until.elementLocated(By.css(buttonContentSelector)), timeout, `${buttonName} content not found`)

        const button = await buttonContent.findElement(By.xpath('./..'))
        await webviewView.getDriver().wait(until.elementIsEnabled(button), timeout, `${buttonName} not clickable`)

        await button.click()
        await webviewView.getDriver().sleep(300)
    } catch (e) {
        console.error(`Failed to click ${buttonName}:`, {
            error: e,
            timestamp: new Date().toISOString(),
        })
        try {
            const screenshot = await webviewView.getDriver().takeScreenshot()
            console.log(`Screenshot taken at time of ${buttonName} failure`, screenshot)
        } catch (screenshotError) {
            console.error('Failed to take error screenshot:', screenshotError)
        }
        throw new Error(`Failed to click ${buttonName}: ${e}`)
    }
}

/**
 * Presses a single key globally
 * @param driver The WebDriver instance
 * @param key The key to press
 */
export async function pressKey(driver: WebDriver, key: keyof typeof Key): Promise<void> {
    await driver.actions().sendKeys(key).perform()
}

/**
 * Presses a keyboard shortcut with modifier keys
 * @param driver The WebDriver instance
 * @param key The keys to press
 *
 * Examples:
 * Ctrl + C | await pressShortcut(driver, Key.CONTROL, 'c')
 * Ctrl + Shift + T | await pressShortcut(driver, Key.CONTROL, Key.SHIFT, 't')
 */
export async function pressShortcut(driver: WebDriver, ...keys: (string | keyof typeof Key)[]): Promise<void> {
    // Replace CONTROL with COMMAND on macOS
    const platformKeys = keys.map((key) => {
        if (key === Key.CONTROL && process.platform === 'darwin') {
            return Key.COMMAND
        }
        return key
    })
    const actions = driver.actions()
    for (const key of platformKeys) {
        actions.keyDown(key)
    }
    for (const key of platformKeys.reverse()) {
        actions.keyUp(key)
    }
    await actions.perform()
}

/**
 * Writes text to the chat input and optionally sends it
 * @param prompt The text to write in the chat input
 * @param webview The WebviewView instance
 * @param send Whether to click the send button (defaults to true)
 */
export async function writeToChat(prompt: string, webview: WebviewView, send = true): Promise<void> {
    const chatInput = await waitForElement(webview, By.css('.mynah-chat-prompt-input'))
    await chatInput.sendKeys(prompt)
    if (send) {
        const sendButton = await waitForElement(webview, By.css('.mynah-chat-prompt-button'))
        await sendButton.click()
    }
}

/**
 * Waits for a chat response to be generated
 * @param webview The WebviewView instance
 * @param timeout The timeout in milliseconds
 * @throws Error if timeout occurs before response is detected
 */
export async function waitForChatResponse(webview: WebviewView, timeout = 15000): Promise<void> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
        const conversationContainers = await webview.findWebElements(By.css('.mynah-chat-items-conversation-container'))

        if (conversationContainers.length > 0) {
            const latestContainer = conversationContainers[conversationContainers.length - 1]

            const chatItems = await latestContainer.findElements(By.css('*'))

            if (chatItems.length >= 2) {
                return
            }
        }
        await sleep(1000)
    }

    throw new Error('Timeout waiting for chat response')
}

/**
 * Clears the text in the chat input field
 * @param webview The WebviewView instance
 */
export async function clearChatInput(webview: WebviewView): Promise<void> {
    const chatInput = await waitForElement(webview, By.css('.mynah-chat-prompt-input'))
    await chatInput.sendKeys(
        process.platform === 'darwin'
            ? '\uE03D\u0061' // Command+A on macOS
            : '\uE009\u0061' // Ctrl+A on Windows/Linux
    )
    await chatInput.sendKeys('\uE003') // Backspace
}

/**
 * Creates a new text file and returns the editor
 * @param workbench The Workbench instance
 * @returns Promise<TextEditor> The text editor for the new file
 */
export async function createNewTextFile(workbench: Workbench, editorView: EditorView): Promise<TextEditor> {
    await workbench.executeCommand('Create: New File...')
    await (await InputBox.create()).selectQuickPick('Text File')
    await sleep(1000)
    const editor = await editorView.openEditor('Untitled-1')
    if (!editor || !(editor instanceof TextEditor)) {
        throw new Error('Failed to open text editor')
    }
    const textEditor = editor as TextEditor
    return textEditor
}

/**
 * Writes the given string in the textEditor in the next empty line
 * @param textEditor The TextEditor instance
 * @param text The text the user wants to type
 * @returns Promise<void>
 */
export async function writeToTextEditor(textEditor: TextEditor, text: string): Promise<void> {
    // We require a "dummy" space to be written such that we can properly index the
    // number of lines to register the textEditor.
    await textEditor.typeTextAt(1, 1, ' ')
    const currentLines = await textEditor.getNumberOfLines()
    await textEditor.typeTextAt(currentLines, 1, text)
}

/**
 * Waits for Inline Generation by Amazon Q by checking if line count stops changing.
 * The function checks for a "stable state" by monitoring the number of lines in the editor.
 * A stable state is achieved when the line count remains unchanged for 3 consecutive checks (3 seconds).
 * Checks are performed every 1 second.
 * @param editor The TextEditor instance
 * @param timeout Maximum time to wait in milliseconds (default: 15000). Function will throw an error if generation takes longer than this timeout.
 * @returns Promise<void>
 * @throws Error if timeout is exceeded before a stable state is reached
 */
export async function waitForInlineGeneration(editor: TextEditor, timeout = 15000): Promise<void> {
    const startTime = Date.now()
    let previousLines = await editor.getNumberOfLines()
    let stableCount = 0

    while (Date.now() - startTime < timeout) {
        await sleep(1000)
        const currentLines = await editor.getNumberOfLines()

        if (currentLines === previousLines) {
            stableCount++
            if (stableCount >= 3) {
                return
            }
        } else {
            stableCount = 0
        }

        previousLines = currentLines
    }

    throw new Error(`Editor stabilization timed out after ${timeout}ms`)
}

/**
 * Finds an item based on the text
 * @param items WebElement array to search
 * @param text The text of the item
 * @returns Promise<WebElement> The first element that contains the specified text
 */
export async function findItemByText(items: WebElement[], text: string) {
    for (const item of items) {
        const itemText = await item.getText()
        if (itemText?.trim().startsWith(text)) {
            return item
        }
    }
    throw new Error(`Item with text "${text}" not found`)
}

/**
 * Finds mynah card elements
 * @param webviewView The WebviewView instance
 * @returns Promise<WebElement[]> Array of mynah card elements
 */
export async function findMynahCards(webviewView: WebviewView): Promise<WebElement[]> {
    const elements = await webviewView.findWebElements(By.css('.mynah-card'))
    await sleep(100)
    return elements
}

/**
 * Finds mynah card elements
 * @param webviewView The WebviewView instance
 * @returns Promise<WebElement[]> Array of mynah card elements
 */
export async function findMynahCardsBody(webviewView: WebviewView): Promise<WebElement[]> {
    return await webviewView.findWebElements(By.css('.mynah-card-body'))
}

/**
 * Prints the HTML content of a web element for debugging purposes
 * @param element The WebElement to print HTML for
 */
export async function printElementHTML(element: WebElement): Promise<void> {
    const htmlContent = await element.getAttribute('outerHTML')

    const formattedHTML = htmlContent
        .replace(/></g, '>\n<')
        .replace(/\s+/g, ' ')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join('\n')

    console.log(`=== HTML CONTENT ===`)
    console.log(formattedHTML)
    console.log('=== END HTML ===')
}

/**
 * Checks for more content indicator and clicks it if present
 * @param webviewView The WebviewView instance
 */
export async function clickMoreContentIndicator(webviewView: WebviewView): Promise<void> {
    try {
        const moreContentIndicator = await webviewView.findWebElement({ css: '.mynah-ui-icon-scroll-down' })
        if (moreContentIndicator) {
            await moreContentIndicator.click()
            await sleep(200)
        }
    } catch (error) {
        // No more content indicator found
    }
}

/**
 * Validates Amazon Q streaming response
 * @param webviewView The WebviewView instance
 * @param isHelpCommand Whether this is a /help command (defaults to false)
 * @throws Error if insufficient response is received
 */
export async function validateAmazonQResponse(webviewView: WebviewView, isHelpCommand = false): Promise<void> {
    const streamingResponses = await webviewView.findWebElements({
        css: '[data-testid="chat-item-answer-stream"]',
    })
    const requiredLength = isHelpCommand ? 1 : 2
    if (streamingResponses.length >= requiredLength) {
        // console.log('Amazon Q responded successfully with meaningful content')
        // Print streaming responses
        // for (let i = 0; i < streamingResponses.length; i++) {
        //     const responseText = await streamingResponses[i].getText()
        //     console.log(`Streaming Response ${i + 1}:`, responseText)
        // }
    } else {
        throw new Error('Amazon Q did not provide sufficient response')
    }
}

/**
 * Opens testFile.py through Explorer
 * @param editorView The EditorView instance
 * @returns Promise<TextEditor> The text editor for the opened file
 */
export async function openTestFile(editorView: EditorView): Promise<TextEditor> {
    // Open testFile.py through Explorer
    const explorerView = await new ActivityBar().getViewControl('Explorer')
    const sideBar = (await explorerView?.openView()) as SideBarView
    const item = await (await sideBar.getContent().getSections())[0].findItem('testFile.py')
    await item?.click()
    await sleep(1000)

    const textEditor = (await editorView.openEditor('testFile.py')) as TextEditor
    return textEditor
}

/**
 * Closes the terminal panel if it's open
 * @param webview The WebviewView instance
 */
export async function closeTerminal(webview: WebviewView): Promise<void> {
    try {
        await webview.switchBack()
        const workbench = new Workbench()
        await workbench.executeCommand('View: Close Panel')
        await sleep(500)
        await webview.switchToFrame()
    } catch (error) {
        console.log('Terminal close operation completed or no terminal was open')
    }
}
