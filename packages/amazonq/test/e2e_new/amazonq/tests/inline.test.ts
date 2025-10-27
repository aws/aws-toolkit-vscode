/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { Workbench, EditorView, InputBox, TextEditor, WebviewView, Key } from 'vscode-extension-tester'
import { testContext } from '../utils/testContext'
import { createNewTextFile, writeToTextEditor, waitForInlineGeneration, pressShortcut } from '../utils/generalUtils'
import assert from 'assert'

describe('Amazon Q Inline Completion / Chat Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(150000)
    let workbench: Workbench
    let editorView: EditorView
    let textEditor: TextEditor
    let webviewView: WebviewView

    beforeEach(async function () {
        webviewView = testContext.webviewView
        await webviewView.switchBack()
        workbench = testContext.workbench
        editorView = new EditorView()
        testContext.editorView = editorView
        textEditor = await createNewTextFile(workbench, editorView)
    })
    afterEach(async function () {
        // Switch back to iframe when dealing with external webviews from Amazon Q.
        await editorView.closeAllEditors()
        await webviewView.switchToFrame()
    })

    it('Inline Test Generate', async () => {
        const textBefore = await textEditor.getText()
        await workbench.executeCommand('Amazon Q: Inline Chat')
        const input = new InputBox()
        await input.sendKeys('Generate the fibonacci sequence through iteration')
        await input.sendKeys(Key.ENTER)
        // Wait for Amazon Q to finish generating code
        await waitForInlineGeneration(textEditor)

        const textAfter = await textEditor.getText()
        assert(textAfter.length > textBefore.length, 'Amazon Q generated code')
        await textEditor.clearText()
    })

    it('Inline Keybind Shortcut', async () => {
        await writeToTextEditor(textEditor, 'def fibonacci(n):')
        await textEditor.selectText('def fibonacci(n):')

        const driver = webviewView.getDriver()
        await pressShortcut(driver, Key.COMMAND, 'i')
        const input = new InputBox()
        await input.sendKeys('Generate the fibonacci sequence through recursion')
        await input.sendKeys(Key.ENTER)
        await waitForInlineGeneration(textEditor)
        // Clean Up Text
        await textEditor.clearText()
    })
})
