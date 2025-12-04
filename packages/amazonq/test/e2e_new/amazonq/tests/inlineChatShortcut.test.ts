/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { EditorView, TextEditor, WebviewView, Key, WebDriver, InputBox } from 'vscode-extension-tester'
import { testContext } from '../utils/testContext'
import {
    waitForInlineGeneration,
    pressShortcut,
    openTestFile,
    sleep,
    clickMoreContentIndicator,
    validateAmazonQResponse,
    findMynahCardsBody,
    findItemByText,
    writeToChat,
} from '../utils/generalUtils'
import { setupFactorialFunction, validateTestFileGeneration } from '../helpers/inlineHelper'
import { closeAllTabs } from '../utils/cleanupUtils'
import assert from 'assert'

describe('Amazon Q Inline Completion / Chat Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(150000)

    let editorView: EditorView
    let textEditor: TextEditor
    let webviewView: WebviewView
    let driver: WebDriver

    beforeEach(async function () {
        webviewView = testContext.webviewView
        await webviewView.switchBack()
        editorView = new EditorView()
        if (this.currentTest?.title !== 'Allows User to Open Command Palette Test') {
            textEditor = await openTestFile(editorView)
        }
        if (
            this.currentTest?.title !== 'Allows User to Accept Inline Suggestions with Enter Key' &&
            this.currentTest?.title !== 'Allows User to Reject Inline Suggestions with ESC Key' &&
            this.currentTest?.title !== 'Allows User to Open Command Palette Test'
        ) {
            await setupFactorialFunction(textEditor)
        }
        driver = webviewView.getDriver()
    })

    afterEach(async function () {
        if (this.currentTest?.title !== 'Allows User to Open Command Palette Test') {
            await textEditor.clearText()
            await textEditor.save()
        }
        await editorView.closeAllEditors()

        // Skip webview cleanup for Inline Keybind Shortcut and Command Palette test
        if (
            this.currentTest?.title !== 'Allows User to Accept Inline Suggestions with Enter Key' &&
            this.currentTest?.title !== 'Allows User to Reject Inline Suggestions with ESC Key' &&
            this.currentTest?.title !== 'Allows User to Open Command Palette Test'
        ) {
            // Switch back to webview
            await webviewView.switchToFrame()
            await sleep(1000)
            await closeAllTabs(webviewView)
        }
    })

    it('Allows User to Open Command Palette Test', async () => {
        await pressShortcut(driver, Key.CONTROL, Key.SHIFT, 'p')
        const input = new InputBox()
        await input.sendKeys('Preferences: Open Keyboard Shortcuts')
        await input.sendKeys(Key.ENTER)
    })

    it('Allows User to Accept Inline Suggestions with Enter Key', async () => {
        const textBefore = await textEditor.getText()
        await pressShortcut(driver, Key.COMMAND, 'i')
        const input = new InputBox()
        await input.sendKeys('Generate the fibonacci sequence through recursion')
        await input.sendKeys(Key.ENTER)
        await waitForInlineGeneration(textEditor)
        await pressShortcut(driver, Key.ENTER)
        const textAfter = await textEditor.getText()
        assert(textAfter.length > textBefore.length, 'Amazon Q generated code')
    })

    it('Allows User to Reject Inline Suggestions with ESC Key', async () => {
        const textBefore = await textEditor.getText()
        await pressShortcut(driver, Key.COMMAND, 'i')
        const input = new InputBox()
        await input.sendKeys('Generate the fibonacci sequence through recursion')
        await input.sendKeys(Key.ENTER)
        await waitForInlineGeneration(textEditor)
        await pressShortcut(driver, Key.ESCAPE)
        const textAfter = await textEditor.getText()
        assert(textAfter.length === textBefore.length, 'Amazon Q generated code')
    })

    it('Allows User to Explain Code Using Shortcut', async () => {
        await pressShortcut(driver, Key.CONTROL, Key.ALT, 'e')
        await webviewView.switchToFrame()
        await sleep(7000)
        const textElements = await findMynahCardsBody(webviewView)
        await findItemByText(textElements, 'Explain the following part of my code:')
        await clickMoreContentIndicator(webviewView)
        await validateAmazonQResponse(webviewView)
        await webviewView.switchBack()
    })

    it('Allows User to Refactor Code Using Shortcut', async () => {
        const driver = webviewView.getDriver()
        await pressShortcut(driver, Key.CONTROL, Key.ALT, 'u')
        await webviewView.switchToFrame()
        await sleep(7000)
        const textElements = await findMynahCardsBody(webviewView)
        await findItemByText(textElements, 'Refactor the following part of my code:')
        await clickMoreContentIndicator(webviewView)
        await validateAmazonQResponse(webviewView)
        await webviewView.switchBack()
    })

    it('Allows User to Optimize Code Using Shortcut', async () => {
        const driver = webviewView.getDriver()
        await pressShortcut(driver, Key.CONTROL, Key.ALT, 'a')
        await webviewView.switchToFrame()
        await sleep(7000)
        const textElements = await findMynahCardsBody(webviewView)
        await findItemByText(textElements, 'Optimize the following part of my code:')
        await clickMoreContentIndicator(webviewView)
        await validateAmazonQResponse(webviewView)
        await webviewView.switchBack()
    })

    it('Allows User to Fix Code Using Shortcut', async () => {
        const driver = webviewView.getDriver()
        await pressShortcut(driver, Key.CONTROL, Key.ALT, 'y')
        await webviewView.switchToFrame()
        await sleep(7000)
        const textElements = await findMynahCardsBody(webviewView)
        await findItemByText(textElements, 'Fix the following part of my code:')
        await clickMoreContentIndicator(webviewView)
        await validateAmazonQResponse(webviewView)
        await webviewView.switchBack()
    })

    it('Allows User to Send to prompt Code Using Shortcut', async () => {
        await pressShortcut(driver, Key.CONTROL, Key.ALT, 'q')
        await webviewView.switchToFrame()
        await writeToChat('Explain the code', webviewView)
        await sleep(7000)
        const textElements = await findMynahCardsBody(webviewView)
        await findItemByText(textElements, 'Explain the code')
        await clickMoreContentIndicator(webviewView)
        await validateAmazonQResponse(webviewView)
        await webviewView.switchBack()
    })

    it('Allows User to Generate Tests Using Shortcut', async () => {
        await pressShortcut(driver, Key.CONTROL, Key.ALT, 't')
        await webviewView.switchToFrame()
        await sleep(7000)
        const textElements = await findMynahCardsBody(webviewView)
        await findItemByText(textElements, 'Generate Tests the following part of my code:')
        await clickMoreContentIndicator(webviewView)
        await validateAmazonQResponse(webviewView)
        await validateTestFileGeneration(webviewView)
        await webviewView.switchBack()
    })
})
