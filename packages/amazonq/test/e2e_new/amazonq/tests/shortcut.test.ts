/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { Workbench, EditorView, TextEditor, InputBox, WebviewView, Key } from 'vscode-extension-tester'
import { testContext } from '../utils/testContext'
import {
    clearChat,
    pressShortcut,
    createNewTextFile,
    writeToTextEditor,
    waitForChatResponse,
} from '../utils/generalUtils'
import { closeAllTabs } from '../utils/cleanupUtils'

describe('Amazon Q Shortcut Functionality Tests', function () {
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
        await closeAllTabs(webviewView)
        await clearChat(webviewView)
    })
    it('Allows User to Verify Command Palette Works as Expected', async () => {
        const driver = webviewView.getDriver()
        await pressShortcut(driver, Key.CONTROL, Key.SHIFT, 'p')
        const input = new InputBox()
        await input.sendKeys('Preferences: Open Keyboard Shortcuts')
        await input.sendKeys(Key.ENTER)
        await editorView.closeAllEditors()
        await webviewView.switchToFrame()
    })
    it('Allows User to Generate Tests Using Keybind', async () => {
        await writeToTextEditor(textEditor, 'def fibonacci(n):')
        await textEditor.selectText('def fibonacci(n):')

        const driver = webviewView.getDriver()
        await pressShortcut(driver, Key.CONTROL, Key.ALT, 't')
        await textEditor.clearText()
        await editorView.closeAllEditors()
        await webviewView.switchToFrame()
        await waitForChatResponse(webviewView)
    })
    it('Allows User to Select and Explain Code Using Keybind', async () => {
        await writeToTextEditor(textEditor, 'def fibonacci(n):')
        await textEditor.selectText('def fibonacci(n):')

        const driver = webviewView.getDriver()
        await pressShortcut(driver, Key.CONTROL, Key.ALT, 'e')
        await textEditor.clearText()
        await editorView.closeAllEditors()
        await webviewView.switchToFrame()
        await waitForChatResponse(webviewView)
    })
    it('Allows User to Optimize Code Using Keybind', async () => {
        await writeToTextEditor(textEditor, 'def fibonacci(n):')
        await textEditor.selectText('def fibonacci(n):')

        const driver = webviewView.getDriver()
        await pressShortcut(driver, Key.CONTROL, Key.ALT, 'a')
        await textEditor.clearText()
        await editorView.closeAllEditors()
        await webviewView.switchToFrame()
        await waitForChatResponse(webviewView)
    })
})
