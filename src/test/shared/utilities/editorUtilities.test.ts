/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import * as path from 'path'
import * as semver from 'semver'
import { closeAllEditors, assertTabCount, createTestWorkspaceFolder, openATextEditorWithText } from '../../testUtil'
import { getOpenFilesInWindow } from '../../../shared/utilities/editorUtilities'
import { getMinVscodeVersion } from '../../../shared/vscode/env'

// VSCode tab APIs are available since 1.68.0
function shouldRunTheTest(): boolean {
    if (semver.gte(getMinVscodeVersion(), '1.68.0')) {
        throw new Error('Minimum VSCode version is greater than 1.68.0, this check should be removed')
    }
    return !!(semver.valid(vscode.version) && semver.gte(vscode.version, '1.68.0'))
}

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

        it('no filter provided as argument, should return all files opened', async function () {
            if (!shouldRunTheTest()) {
                this.skip()
            }

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
            if (!shouldRunTheTest()) {
                this.skip()
            }

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
