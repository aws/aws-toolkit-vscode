/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import vscode from 'vscode'
import { session, vsCodeCursorUpdateDelay } from 'aws-core-vscode/codewhisperer'
import { sleep, waitUntil } from 'aws-core-vscode/shared'
import { assertTextEditorContains } from 'aws-core-vscode/test'

// Note: RecommendationHandler.isSuggestionVisible seems not to work well, hence not using it
export async function waitUntilSuggestionSeen(index: number = 0) {
    const ok = await waitUntil(
        async () => {
            console.log('Suggestion state: %O', session.getSuggestionState(index))
            return session.getSuggestionState(index) === 'Showed'
        },
        {
            interval: 500,
            timeout: 5000,
        }
    )

    assert.ok(ok === true)
}

export async function acceptByTab() {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        throw new Error('no active editor')
    }
    const originalContent = editor.document.getText()
    console.log('original content: %O', originalContent)

    // we have to wait until the inline suggestion is shown in the editor however we don't have an useable API for that so hacky wait to know if the accept is taking effect
    await waitUntil(
        async () => {
            await vscode.commands.executeCommand('editor.action.inlineSuggest.commit')
            return vscode.window.activeTextEditor?.document.getText() !== originalContent
        },
        {
            interval: 50,
            timeout: 5000,
        }
    )

    // required because oninlineAcceptance has sleep(vsCodeCursorUpdateDelay), otherwise assertion will be executed "before" onAcceptance hook
    await sleep(vsCodeCursorUpdateDelay + 200)
}

export async function rejectByEsc() {
    return vscode.commands.executeCommand('aws.amazonq.rejectCodeSuggestion')
}

export async function navigateNext() {
    return vscode.commands.executeCommand('editor.action.inlineSuggest.showNext')
}

export async function navigatePrev() {
    return vscode.commands.executeCommand('editor.action.inlineSuggest.showPrevious')
}

export async function closeActiveEditor() {
    return vscode.commands.executeCommand('workbench.action.closeActiveEditor')
}

export async function typing(editor: vscode.TextEditor, s: string) {
    const initialContent = editor.document.getText()
    const positionBefore = editor.document.offsetAt(editor.selection.active)

    await editor.edit((edit) => {
        edit.insert(editor.selection.active, s)
    })

    await assertTextEditorContains(initialContent + s)
    await waitUntil(
        async () => {
            const positionPendingUpdate = editor.document.offsetAt(editor.selection.active)
            if (positionPendingUpdate === positionBefore + s.length) {
                return true
            }
        },
        { interval: 50 }
    )
    const positionAfter = editor.document.offsetAt(editor.selection.active)
    assert.strictEqual(positionAfter, positionBefore + s.length)
}

export async function backspace(editor: vscode.TextEditor) {
    return vscode.commands.executeCommand('deleteLeft')
}
