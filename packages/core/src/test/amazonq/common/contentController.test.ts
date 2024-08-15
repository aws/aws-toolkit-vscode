import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import * as path from 'path'
import assert from 'assert'
import { EditorContentController } from '../../../amazonq/commons/controllers/contentController'
import { makeTemporaryToolkitFolder } from '../../../shared'

describe('contentController', () => {
    let controller: EditorContentController
    let tempFolder: string

    beforeEach(async () => {
        controller = new EditorContentController()
        // Make a temp folder for all these tests
        tempFolder = await makeTemporaryToolkitFolder()
    })

    afterEach(async function () {
        await fs.remove(tempFolder)
    })

    describe('insertTextAtCursorPosition', () => {
        it('insert code when left hand size has no non empty character', async () => {
            const programFile = path.join(tempFolder, 'program.python')
            await fs.writeFile(programFile, 'def hello_world():\n    ')
            const doc = await vscode.workspace.openTextDocument(programFile)
            const editor = await vscode.window.showTextDocument(doc)
            if (editor) {
                const pos = new vscode.Position(1, 4)
                editor.selection = new vscode.Selection(pos, pos)
                controller.insertTextAtCursorPosition(
                    'abc\n   def',
                    (editor: vscode.TextEditor, cursorStart: vscode.Position) => {
                        assert.equal(editor.document.getText(), 'def hello_world():\n    abc\n    def')
                    }
                )
            }
        })

        it('insert code when left hand size has non empty character', async () => {
            const programFile = path.join(tempFolder, 'program.python')
            await fs.writeFile(programFile, 'def hello_world():\n    ')
            const doc = await vscode.workspace.openTextDocument(programFile)
            const editor = await vscode.window.showTextDocument(doc)
            if (editor) {
                const pos = new vscode.Position(0, 4)
                editor.selection = new vscode.Selection(pos, pos)
                controller.insertTextAtCursorPosition(
                    'abc\n   def',
                    (editor: vscode.TextEditor, cursorStart: vscode.Position) => {
                        assert.equal(editor.document.getText(), 'def abc\n    defhello_world():\n')
                    }
                )
            }
        })
    })
})
