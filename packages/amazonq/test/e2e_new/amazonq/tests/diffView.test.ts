/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { EditorView, TextEditor, WebviewView, Workbench } from 'vscode-extension-tester'
import { testContext } from '../utils/testContext'
import { sleep, openTestFile, writeToChat } from '../utils/generalUtils'
import { closeAllTabs } from '../utils/cleanupUtils'
import { clickPinContextButton, clickPinContextMenuItem, clickSubMenuItem } from '../helpers/pinContextHelper'

describe('Amazon Q Inline Chat Functionality', function () {
    this.timeout(150000)

    let editorView: EditorView
    let webviewView: WebviewView
    let textEditor: TextEditor
    let workbench: Workbench

    beforeEach(async function () {
        webviewView = testContext.webviewView
        await webviewView.switchBack()
        workbench = testContext.workbench
        editorView = new EditorView()
        textEditor = await openTestFile(editorView)
        await textEditor.typeText('def factorial(n): if n == 0: return 1 else:return n * factorial(n-1)')
        await textEditor.save()
    })

    afterEach(async function () {
        await closeAllTabs(webviewView)
        await webviewView.switchBack()
        await editorView.closeAllEditors()
        textEditor = await openTestFile(editorView)
        await textEditor.clearText()
        await textEditor.save()
        await editorView.closeAllEditors()
        await webviewView.switchToFrame()
    })

    it('Test diff view feature', async () => {
        await workbench.executeCommand('Amazon Q: Open Chat')
        await webviewView.switchToFrame()
        await sleep(2000)
        await clickPinContextButton(webviewView)
        await clickPinContextMenuItem(webviewView, 'Files')
        await clickSubMenuItem(webviewView, 'Active file')
        await writeToChat('Enhance the code', webviewView)
        await sleep(6000)
        const fileTreeFile = await webviewView.findWebElement({ css: '[data-testid="chat-item-file-tree-file"]' })
        await fileTreeFile.click()
    })
})
