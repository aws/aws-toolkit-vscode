/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import * as path from 'path'
import * as semver from 'semver'
import { closeAllEditors, toFile, assertTabCount, createTestWorkspaceFolder } from '../../testUtil'
import { getOpenFilesInWindow } from '../../../codewhisperer/util/supplementalContext/supplementalContextUtil'

async function openATextEditorWithText(fileText: string, fileName: string, folder: string): Promise<vscode.TextEditor> {
    const completeFilePath = path.join(folder, fileName)
    toFile(fileText, completeFilePath)

    const textDocument = await vscode.workspace.openTextDocument(completeFilePath)

    return await vscode.window.showTextDocument(textDocument, { preview: false })
}

// VSCode tab APIs are available since 1.68.0
function shouldRunTheTest(): boolean {
    return (semver.valid(vscode.version) && semver.gte(vscode.version, '1.68.0')) as boolean
}

describe('supplementalContextUtil', function () {
    let tempFolder: string

    describe('getOpenFilesInWindow', async function () {
        before(async function () {
            this.timeout(60000)
        })

        beforeEach(async function () {
            tempFolder = (await createTestWorkspaceFolder()).uri.fsPath
        })

        afterEach(async function () {
            await closeAllEditors()
        })

        it('test case 1, no filter provided as argument', async function () {
            if (!shouldRunTheTest) {
                this.skip()
            }

            await openATextEditorWithText('content-1', 'file-1.java', tempFolder)
            await openATextEditorWithText('content-2', 'file-2.java', tempFolder)
            await openATextEditorWithText('content-3', 'file-3.java', tempFolder)
            await openATextEditorWithText('content-4', 'file-4.java', tempFolder)

            await assertTabCount(4)

            const actual = new Set<string>(await getOpenFilesInWindow())
            assert.strictEqual(actual.size, 4)
            assert.ok(actual.has(path.join(tempFolder, 'file-1.java')))
            assert.ok(actual.has(path.join(tempFolder, 'file-2.java')))
            assert.ok(actual.has(path.join(tempFolder, 'file-3.java')))
            assert.ok(actual.has(path.join(tempFolder, 'file-4.java')))
        })

        it('test case 2 with filter argument provided', async function () {
            if (!shouldRunTheTest) {
                this.skip()
            }

            await openATextEditorWithText('content-1', 'file-1.java', tempFolder)
            await openATextEditorWithText('content-2', 'file-2.java', tempFolder)
            await openATextEditorWithText('content-3', 'file-3.txt', tempFolder)
            await openATextEditorWithText('content-4', 'file-4.txt', tempFolder)

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
