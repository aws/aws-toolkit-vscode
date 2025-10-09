/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { EditorView, InputBox, Key, TextEditor, WebviewView, Workbench } from 'vscode-extension-tester'
import { testContext } from '../utils/testContext'
import {
    sleep,
    pressShortcut,
    writeToTextEditor,
    waitForChatResponse,
    createNewTextFile,
    writeToChat,
    findItemByText,
    findMynahCardsBody,
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
        await writeToTextEditor(textEditor, 'def factorial(n): if n == 0: return 1 else:return n * factorial(n-1)')
        await textEditor.selectText('def factorial(n): if n == 0: return 1 else:return n * factorial(n-1)')
        const driver = webviewView.getDriver()
        await pressShortcut(driver, Key.CONTROL, Key.ALT, 't')
        await textEditor.clearText()
        await editorView.closeAllEditors()
        await webviewView.switchToFrame()
        await waitForChatResponse(webviewView)
        const textElements = await findMynahCardsBody(webviewView)
        await findItemByText(textElements, 'Generate Tests the following part of my code:')
    })

    it('Allows User to Select and Explain Code Using Keybind', async () => {
        await writeToTextEditor(textEditor, 'def factorial(n): if n == 0: return 1 else:return n * factorial(n-1)')
        await textEditor.selectText('def factorial(n): if n == 0: return 1 else:return n * factorial(n-1)')
        const driver = webviewView.getDriver()
        await pressShortcut(driver, Key.CONTROL, Key.ALT, 'e')
        await textEditor.clearText()
        await editorView.closeAllEditors()
        await webviewView.switchToFrame()
        await waitForChatResponse(webviewView)
        const textElements = await findMynahCardsBody(webviewView)
        await findItemByText(textElements, 'Explain the following part of my code:')
    })

    it('Allows User to Optimize Code Using Shortcut', async () => {
        await writeToTextEditor(textEditor, 'def factorial(n): if n == 0: return 1 else:return n * factorial(n-1)')
        await textEditor.selectText('def factorial(n): if n == 0: return 1 else:return n * factorial(n-1)')
        const driver = webviewView.getDriver()
        await pressShortcut(driver, Key.CONTROL, Key.ALT, 'a')
        await textEditor.clearText()
        await editorView.closeAllEditors()
        await webviewView.switchToFrame()
        await waitForChatResponse(webviewView)
        const textElements = await findMynahCardsBody(webviewView)
        await findItemByText(textElements, 'Optimize the following part of my code:')
    })

    it('Allows User to Fix Code Using Shortcut', async () => {
        await writeToTextEditor(textEditor, 'def factorial(n): if n == 0: return 1 else:return n * factorial(n-1)')
        await textEditor.selectText('def factorial(n): if n == 0: return 1 else:return n * factorial(n-1)')
        const driver = webviewView.getDriver()
        await pressShortcut(driver, Key.CONTROL, Key.ALT, 'y')
        await textEditor.clearText()
        await editorView.closeAllEditors()
        await webviewView.switchToFrame()
        await waitForChatResponse(webviewView)
        const textElements = await findMynahCardsBody(webviewView)
        await findItemByText(textElements, 'Fix the following part of my code:')
    })

    it('Allows User to Send to prompt Code Using Shortcut', async () => {
        await writeToTextEditor(textEditor, 'def factorial(n): if n == 0: return 1 else:return n * factorial(n-1)')
        await textEditor.selectText('def factorial(n): if n == 0: return 1 else:return n * factorial(n-1)')
        const driver = webviewView.getDriver()
        await pressShortcut(driver, Key.CONTROL, Key.ALT, 'q')
        await textEditor.clearText()
        await editorView.closeAllEditors()
        await webviewView.switchToFrame()
        await writeToChat('Explain the code', webviewView)
        await waitForChatResponse(webviewView)
        await sleep(200)
        const textElements = await findMynahCardsBody(webviewView)
        await findItemByText(textElements, 'Explain the code')
    })
})
