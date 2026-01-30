/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { EditorView, InputBox, Key, TextEditor, WebviewView, Workbench } from 'vscode-extension-tester'
import { testContext } from '../utils/testContext'
import {
    sleep,
    clickMoreContentIndicator,
    validateAmazonQResponse,
    openTestFile,
    waitForInlineGeneration,
    findMynahCardsBody,
    findItemByText,
    writeToChat,
} from '../utils/generalUtils'
import { closeAllTabs } from '../utils/cleanupUtils'
import { setupFactorialFunction, clickInlineAction, validateTestFileGeneration } from '../helpers/inlineHelper'
import assert from 'assert'

describe('Amazon Q Inline Chat Functionality', function () {
    this.timeout(150000)

    let editorView: EditorView
    let webviewView: WebviewView
    let workbench: Workbench
    let textEditor: TextEditor

    beforeEach(async function () {
        webviewView = testContext.webviewView
        await webviewView.switchBack()
        workbench = testContext.workbench
        editorView = new EditorView()
        textEditor = await openTestFile(editorView)
        // Skip webview cleanup for Inline Chat Test
        if (
            this.currentTest?.title !== 'Inline Chat Accept Test' &&
            this.currentTest?.title !== 'Inline Chat Reject Test'
        ) {
            await setupFactorialFunction(textEditor)
        }
    })

    afterEach(async function () {
        await textEditor.clearText()
        await textEditor.save()
        await editorView.closeAllEditors()

        // Skip webview cleanup for Inline Chat Test
        if (
            this.currentTest?.title !== 'Inline Chat Accept Test' &&
            this.currentTest?.title !== 'Inline Chat Reject Test'
        ) {
            // Switch back to webview
            await webviewView.switchToFrame()
            await sleep(1000)
            await closeAllTabs(webviewView)
        }
    })

    it('Explain Test', async () => {
        await workbench.executeCommand('Amazon Q: Explain')
        await webviewView.switchToFrame()
        await sleep(7000)
        const textElements = await findMynahCardsBody(webviewView)
        await findItemByText(textElements, 'Explain the following part of my code:')
        await clickMoreContentIndicator(webviewView)
        await validateAmazonQResponse(webviewView)
        await webviewView.switchBack()
    })

    it('Refactor Test', async () => {
        await workbench.executeCommand('Amazon Q: Refactor')
        await webviewView.switchToFrame()
        await sleep(7000)
        const textElements = await findMynahCardsBody(webviewView)
        await findItemByText(textElements, 'Refactor the following part of my code:')
        await clickMoreContentIndicator(webviewView)
        await validateAmazonQResponse(webviewView)
        await webviewView.switchBack()
    })

    it('Fix Test', async () => {
        await workbench.executeCommand('Amazon Q: Fix')
        await webviewView.switchToFrame()
        await sleep(7000)
        const textElements = await findMynahCardsBody(webviewView)
        await findItemByText(textElements, 'Fix the following part of my code:')
        await clickMoreContentIndicator(webviewView)
        await validateAmazonQResponse(webviewView)
        await webviewView.switchBack()
    })

    it('Optimize Test', async () => {
        await workbench.executeCommand('Amazon Q: Optimize')
        await webviewView.switchToFrame()
        await sleep(7000)
        const textElements = await findMynahCardsBody(webviewView)
        await findItemByText(textElements, 'Optimize the following part of my code:')
        await clickMoreContentIndicator(webviewView)
        await validateAmazonQResponse(webviewView)
        await webviewView.switchBack()
    })

    it('Send to prompt Test', async () => {
        await workbench.executeCommand('Amazon Q: Send to prompt')
        await webviewView.switchToFrame()
        await writeToChat('Explain the code', webviewView)
        await sleep(7000)
        const textElements = await findMynahCardsBody(webviewView)
        await findItemByText(textElements, 'Explain the code')
        await clickMoreContentIndicator(webviewView)
        await validateAmazonQResponse(webviewView)
        await webviewView.switchBack()
    })

    it('Generate Test', async () => {
        await workbench.executeCommand('Amazon Q: Generate Test')
        await webviewView.switchToFrame()
        await sleep(7000)
        const textElements = await findMynahCardsBody(webviewView)
        await findItemByText(textElements, 'Generate Tests the following part of my code:')
        await clickMoreContentIndicator(webviewView)
        await validateAmazonQResponse(webviewView)
        await validateTestFileGeneration(webviewView)
        await webviewView.switchBack()
    })

    it('Inline Chat Accept Test', async () => {
        const textBefore = await textEditor.getText()
        await workbench.executeCommand('Amazon Q: Inline Chat')
        const input = new InputBox()
        await input.sendKeys('Generate the fibonacci sequence through iteration')
        await input.sendKeys(Key.ENTER)
        await waitForInlineGeneration(textEditor)
        await clickInlineAction(textEditor, 'Accept')
        const textAfter = await textEditor.getText()
        assert(textAfter.length > textBefore.length, 'Amazon Q generated code')
    })

    it('Inline Chat Reject Test', async () => {
        const textBefore = await textEditor.getText()
        await workbench.executeCommand('Amazon Q: Inline Chat')
        const input = new InputBox()
        await input.sendKeys('Generate the fibonacci sequence through iteration')
        await input.sendKeys(Key.ENTER)
        await waitForInlineGeneration(textEditor)
        await clickInlineAction(textEditor, 'Reject')
        const textAfter = await textEditor.getText()
        assert(textAfter.length === textBefore.length, 'Amazon Q generated code')
    })
})
