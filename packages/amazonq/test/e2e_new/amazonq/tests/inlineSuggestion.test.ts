/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { EditorView, Key, TextEditor, WebviewView, Workbench } from 'vscode-extension-tester'
import { openTestFile, pressShortcut, sleep } from '../utils/generalUtils'
import assert from 'assert'
import { testContext } from '../utils/testContext'

describe('Amazon Q Inline Suggestion Functionality', function () {
    this.timeout(150000)

    let editorView: EditorView
    let textEditor: TextEditor
    let webviewView: WebviewView
    let workbench: Workbench

    beforeEach(async function () {
        webviewView = testContext.webviewView
        workbench = testContext.workbench
        await webviewView.switchBack()
        editorView = new EditorView()
        textEditor = await openTestFile(editorView)
    })

    afterEach(async function () {
        await textEditor.clearText()
        await textEditor.save()
        await editorView.closeAllEditors()
        await workbench.executeCommand('Amazon Q: Open Chat')
        await webviewView.switchToFrame()
        await sleep(2000)
    })

    it('Inline Suggestion auto-trigger on typing', async () => {
        const textBefore = await textEditor.getText()
        await textEditor.typeText('def fibonacci(')
        await sleep(5000)
        const textAfter = await textEditor.getText()
        assert(textAfter.length > textBefore.length, 'Inline suggestion auto-triggered')
    })

    it('Inline Suggestion manual trigger', async () => {
        const driver = webviewView.getDriver()
        const textBefore = await textEditor.getText()
        await textEditor.typeText('def fibonacci(')
        await textEditor.moveCursor(1, 15)
        await sleep(5000)
        await pressShortcut(driver, Key.ALT, 'c')
        await sleep(20000)
        const textAfter = await textEditor.getText()
        assert(textAfter.length > textBefore.length, 'Manual inline suggestion triggered')
    })
})
