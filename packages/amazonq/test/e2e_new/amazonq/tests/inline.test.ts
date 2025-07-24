/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { Workbench, EditorView, InputBox, TextEditor, WebviewView, Key } from 'vscode-extension-tester'
import { testContext } from '../utils/testContext'
import { sleep, expect } from '../utils/generalUtils'

function pressShortcut(element: any, key: string, platform: 'mac' | 'windows', modifier: 'cmd' | 'alt' = 'cmd') {
    const modifierKey = modifier === 'cmd' ? (platform === 'mac' ? Key.META : Key.CONTROL) : Key.ALT
    return element.sendKeys(modifierKey, key)
}

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

        await workbench.executeCommand('Create: New File...')
        await (await InputBox.create()).selectQuickPick('Text File')
        await sleep(1000)
        editorView = new EditorView()
        testContext.editorView = editorView
        textEditor = (await editorView.openEditor('Untitled-1')) as TextEditor
        // or if the file we want is currently opened we can simply do
        // editor = new TextEditor();
    })

    after(async function () {
        // cleanup, delete the file contents and close the editor
        await textEditor.clearText()
        await editorView.closeAllEditors()

        // after, in order to not affect the other tests, we must switch back to the webview
        await webviewView.switchToFrame()
    })

    it('Inline Test', async () => {
        // the file is currently empty, lets write something in it
        // note the coordinates are (1, 1) for the beginning of the file
        await textEditor.typeTextAt(1, 1, 'hello')

        // now we can check if the text is correct
        const text = await textEditor.getText()
        expect(text).equals('hello')

        // we can also replace all the text with whatever we want
        await textEditor.setText(`line1\nline2\nline3`)
        // assert how many lines there are now
        expect(await textEditor.getNumberOfLines()).equals(3)

        // get text at the line with given number
        const line = await textEditor.getTextAtLine(2)
        expect(line).include('line2')

        // get the line number of a search string
        const lineNum = await textEditor.getLineOfText('3')
        expect(lineNum).equals(3)

        // the editor should be dirty since we haven't saved yet
        expect(await textEditor.isDirty()).is.true
    })
})
