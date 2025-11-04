/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { TextEditor } from 'vscode-extension-tester'
import { sleep } from '../utils/generalUtils'

/**
 * Sets up text editor with factorial function
 * @param textEditor The TextEditor instance
 */
export async function setupFactorialFunction(textEditor: TextEditor): Promise<void> {
    // Setup text editor with factorial function
    await textEditor.typeText('def factorial(n): if n == 0: return 1 else:return n * factorial(n-1)')
    await textEditor.save()
    await textEditor.selectText('def factorial(n): if n == 0: return 1 else:return n * factorial(n-1)')
    // await textEditor.getDriver().actions().click(textEditor).click(textEditor).click(textEditor).perform()
    await sleep(200)
}
