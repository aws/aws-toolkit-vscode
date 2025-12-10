/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { EditorView, TextEditor, WebviewView, Workbench } from 'vscode-extension-tester'
import { closeAllTabs } from '../utils/cleanupUtils'
import { testContext } from '../utils/testContext'
import {
    clickAddPromptButton,
    clickContextButton,
    clickCreatePromptButton,
    clickImageFile,
    clickPinContextButton,
    clickPinContextMenuItem,
    clickSubMenuItem,
    enterChatInput,
    validateFileInContext,
} from '../helpers/pinContextHelper'
import { openTestFile, sleep, validateAmazonQResponse, writeToChat } from '../utils/generalUtils'
import { setupFactorialFunction } from '../helpers/inlineHelper'

describe('Amazon Q Pin Context Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(300000)
    let webviewView: WebviewView
    let editorView: EditorView
    let textEditor: TextEditor
    let workbench: Workbench

    before(async function () {
        webviewView = testContext.webviewView
        editorView = testContext.editorView
        workbench = testContext.workbench
    })

    afterEach(async () => {
        await closeAllTabs(webviewView)
    })

    it('Allows User to Add File as Context', async () => {
        await webviewView.switchBack()
        textEditor = await openTestFile(editorView)
        await setupFactorialFunction(textEditor)
        await workbench.executeCommand('Amazon Q: Open Chat')
        await webviewView.switchToFrame()
        await sleep(2000)
        await clickPinContextButton(webviewView)
        await clickPinContextMenuItem(webviewView, 'Files')
        await clickSubMenuItem(webviewView, 'Active file')
        await writeToChat('Explain', webviewView)
        await sleep(7000)
        await validateAmazonQResponse(webviewView)
    })

    // it('Allows User to Add Workspace as Context', async () => {
    //     await clickPinContextButton(webviewView)
    //     await clickPinContextMenuItem(webviewView, '@workspace')
    //     await writeToChat('Count number of md files', webviewView)
    //     await sleep(7000)
    //     await validateAmazonQResponse(webviewView)
    // })

    it('Allows User to Add Folder as Context', async () => {
        await clickPinContextButton(webviewView)
        await clickPinContextMenuItem(webviewView, 'Folders')
        await clickSubMenuItem(webviewView, 'Factorial')
        await writeToChat('Explain', webviewView)
        await sleep(7000)
        // todo: Check whether factorial folder is added as context in response
    })

    it('Allows User to Add Sage as Context', async () => {
        await clickPinContextButton(webviewView)
        await clickPinContextMenuItem(webviewView, '@sage')
    })

    // it('Allows User to Add Code as Context', async () => {
    //     await clickPinContextButton(webviewView)
    //     await clickPinContextMenuItem(webviewView, 'Code')
    //     await clickSubMenuItem(webviewView, 'TestFactorial')
    //     await writeToChat('Explain', webviewView)
    //     await sleep(7000)
    //     await clickContextButton(webviewView)
    //     await sleep(2000)
    //     await validateFileInContext(webviewView, 'testFile')
    // })

    it('Allows User to Add Image as Context', async () => {
        await clickPinContextButton(webviewView)
        await clickPinContextMenuItem(webviewView, 'Image')
        await webviewView.switchBack()
        await clickImageFile(webviewView, 'image.png')
        await webviewView.switchToFrame()
        await writeToChat('Explain', webviewView)
        await sleep(10000)
        await clickContextButton(webviewView)
        await sleep(2000)
        await validateFileInContext(webviewView, 'image.png')
    })

    it('Allows User to Add Prompt as Context', async () => {
        await clickPinContextButton(webviewView)
        await clickPinContextMenuItem(webviewView, 'Prompts')
        await clickAddPromptButton(webviewView)
        await enterChatInput(webviewView)
        await clickCreatePromptButton(webviewView)
        await webviewView.switchBack()
        textEditor = (await editorView.openEditor('test.md')) as TextEditor
        await textEditor.setText(
            'Explain the difference between machine learning and deep learning with simple examples.'
        )
        await textEditor.save()
        await editorView.closeEditor('test.md')
        await webviewView.switchToFrame()
        await clickPinContextButton(webviewView)
        await clickPinContextMenuItem(webviewView, 'Prompts')
        await clickSubMenuItem(webviewView, 'test')
        await writeToChat('Explain', webviewView)
        await sleep(7000)
        await clickContextButton(webviewView)
        await sleep(2000)
        await validateFileInContext(webviewView, 'test.md')
    })
})
