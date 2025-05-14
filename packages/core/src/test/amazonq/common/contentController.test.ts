/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import assert from 'assert'
import { EditorContentController } from '../../../amazonq/commons/controllers/contentController'
import { toTextEditor } from '../../testUtil'
import { CWCTelemetryHelper } from '../../../codewhispererChat/controllers/chat/telemetryHelper'
import { ChatSessionStorage } from '../../../codewhispererChat/storages/chatSession'
import { TriggerEventsStorage } from '../../../codewhispererChat'

describe('contentController', () => {
    let controller: EditorContentController

    beforeEach(async () => {
        controller = new EditorContentController()
        CWCTelemetryHelper.instance = new CWCTelemetryHelper(new ChatSessionStorage(), new TriggerEventsStorage())
    })

    describe('insertTextAtCursorPosition', () => {
        it('insert code when left hand size has no non empty character', async () => {
            const editor = await toTextEditor('def hello_world():\n    ', 'test.py')
            if (editor) {
                const pos = new vscode.Position(1, 4)
                editor.selection = new vscode.Selection(pos, pos)
                controller.insertTextAtCursorPosition(
                    'abc\n   def',
                    (editor: vscode.TextEditor, cursorStart: vscode.Position) => {
                        assert.equal(editor.document.getText(), 'def hello_world():\n    abc\n       def')
                    }
                )
            } else {
                assert.fail('Failed to open a text editor')
            }
        })

        it('insert code when left hand size has non empty character 2', async () => {
            const editor = await toTextEditor('def hello_world():\n    ', 'test.py')
            if (editor) {
                const pos = new vscode.Position(0, 4)
                editor.selection = new vscode.Selection(pos, pos)
                controller.insertTextAtCursorPosition(
                    'abc\n   def',
                    (editor: vscode.TextEditor, cursorStart: vscode.Position) => {
                        assert.equal(editor.document.getText(), 'def abc\n   defhello_world():\n    ')
                    }
                )
            } else {
                assert.fail('Failed to open a text editor')
            }
        })
    })
})
