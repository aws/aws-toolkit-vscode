/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { Workbench, EditorView, InputBox, TextEditor, WebviewView, Key } from 'vscode-extension-tester'
import { testContext } from '../utils/testContext'
import { pressKey, createNewTextFile, writeToTextEditor } from '../utils/generalUtils'
import assert from 'assert'

describe('Amazon Q Inline Completion / Chat Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(150000)
    let workbench: Workbench
    let editorView: EditorView
    let textEditor: TextEditor
    let webviewView: WebviewView

    before(async function () {
        webviewView = testContext.webviewView
        await webviewView.switchBack()
        workbench = testContext.workbench

        editorView = new EditorView()
        testContext.editorView = editorView

        textEditor = await createNewTextFile(workbench, editorView)
    })

    it('Inline Test', async () => {
        await writeToTextEditor(textEditor, 'Select Me')
        const text = await textEditor.getText()
        assert.equal(text, 'Select Me')
        await textEditor.clearText()

        await workbench.executeCommand('Amazon Q: Inline Chat')
        const input = new InputBox()
        await input.sendKeys('Write a simple sentece')
        await input.sendKeys(Key.ENTER)
        const driver = textEditor.getDriver()
        await pressKey(driver, 'ENTER')
        await pressKey(driver, 'TAB')
    })
})
