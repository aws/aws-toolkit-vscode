/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { TextEditor, WebviewView, By } from 'vscode-extension-tester'
import { sleep } from '../utils/generalUtils'
import assert from 'assert'

/**
 * Sets up text editor with factorial function
 * @param textEditor The TextEditor instance
 */
export async function setupFactorialFunction(textEditor: TextEditor): Promise<void> {
    // Setup text editor with factorial function
    await textEditor.typeText('def factorial(n): if n == 0: return 1 else:return n * factorial(n-1)')
    await textEditor.save()
    await textEditor.selectText('def factorial(n): if n == 0: return 1 else:return n * factorial(n-1)')
    await sleep(200)
}

/**
 * Validates that test file generation is working
 * @param webviewView The WebviewView instance
 */
export async function validateTestFileGeneration(webviewView: WebviewView): Promise<void> {
    const fileText = await webviewView.findWebElement(By.css('.mynah-chat-item-tree-view-file-item-title-text'))
    const fileName = await fileText.getText()
    assert(fileName.includes('test_factorial.py'), 'Amazon Q should generate test cases for the factorial function')
}

/**
 * Clicks Accept or Reject button in inline chat
 * @param textEditor The TextEditor instance
 * @param action 'Accept' or 'Reject'
 */
export async function clickInlineAction(textEditor: TextEditor, action: 'Accept' | 'Reject'): Promise<void> {
    try {
        const button = await textEditor.findElement({ xpath: `//a[contains(text(), '${action}')]` })
        await button.click()
    } catch (error) {
        throw new Error(`Failed to click ${action} button: ${String(error)}`)
    }
}
