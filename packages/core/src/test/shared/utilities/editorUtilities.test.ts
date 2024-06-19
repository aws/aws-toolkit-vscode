/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import sinon from 'sinon'
import { closeAllEditors, assertTabCount, createTestWorkspaceFolder, openATextEditorWithText } from '../../testUtil'
import { getOpenFilesInWindow, isTextEditor } from '../../../shared/utilities/editorUtilities'

describe('supplementalContextUtil', function () {
    let tempFolder: string

    describe('getOpenFilesInWindow', async function () {
        before(async function () {
            this.timeout(60000)
        })

        beforeEach(async function () {
            await closeAllEditors()
            tempFolder = (await createTestWorkspaceFolder()).uri.fsPath
        })

        afterEach(async function () {
            await closeAllEditors()
        })

        it('isTextEditor returns false if scheme is debug, output or vscode-terminal', async function () {
            const editor = await openATextEditorWithText('content', 'file.java', tempFolder, { preview: false })
            const uri = editor.document.uri

            sinon.stub(uri, 'scheme').get(() => 'debug')
            assert.strictEqual(isTextEditor(editor), false)

            sinon.stub(uri, 'scheme').get(() => 'output')
            assert.strictEqual(isTextEditor(editor), false)

            sinon.stub(uri, 'scheme').get(() => 'vscode-terminal')
            assert.strictEqual(isTextEditor(editor), false)
        })

        it('no filter provided as argument, should return all files opened', async function () {
            await openATextEditorWithText('content-1', 'file-1.java', tempFolder, { preview: false })
            await openATextEditorWithText('content-2', 'file-2.java', tempFolder, { preview: false })
            await openATextEditorWithText('content-3', 'file-3.java', tempFolder, { preview: false })
            await openATextEditorWithText('content-4', 'file-4.java', tempFolder, { preview: false })

            await assertTabCount(4)

            const actual = new Set<string>(await getOpenFilesInWindow())
            assert.strictEqual(actual.size, 4)
            assert.ok(actual.has(path.join(tempFolder, 'file-1.java')))
            assert.ok(actual.has(path.join(tempFolder, 'file-2.java')))
            assert.ok(actual.has(path.join(tempFolder, 'file-3.java')))
            assert.ok(actual.has(path.join(tempFolder, 'file-4.java')))
        })

        it('filter argument provided, should return only files matching the predicate', async function () {
            await openATextEditorWithText('content-1', 'file-1.java', tempFolder, { preview: false })
            await openATextEditorWithText('content-2', 'file-2.java', tempFolder, { preview: false })
            await openATextEditorWithText('content-3', 'file-3.txt', tempFolder, { preview: false })
            await openATextEditorWithText('content-4', 'file-4.txt', tempFolder, { preview: false })

            await assertTabCount(4)

            const actual = new Set<string>(
                await getOpenFilesInWindow(async fileName => path.extname(fileName) === '.java')
            )
            assert.strictEqual(actual.size, 2)
            assert.ok(actual.has(path.join(tempFolder, 'file-1.java')))
            assert.ok(actual.has(path.join(tempFolder, 'file-2.java')))
        })
    })
})
