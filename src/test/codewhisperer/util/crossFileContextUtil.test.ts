/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as semver from 'semver'
import * as crossFile from '../../../codewhisperer/util/supplementalContext/crossFileContextUtil'
import { createMockTextEditor } from '../testUtil'
import { CodeWhispererUserGroupSettings } from '../../../codewhisperer/util/userGroupUtil'
import { UserGroup } from '../../../codewhisperer/models/constants'
import { assertTabCount, closeAllEditors, createTestWorkspaceFolder, openATextEditorWithText } from '../../testUtil'
import { getMinVscodeVersion } from '../../../shared/vscode/env'

const userGroupSettings = CodeWhispererUserGroupSettings.instance
let tempFolder: string

// VSCode tab APIs are available since 1.68.0
function shouldRunTheTest(): boolean {
    if (semver.gte(getMinVscodeVersion(), '1.68.0')) {
        throw new Error('Minimum VSCode version is greater than 1.68.0, this check should be removed')
    }
    return !!(semver.valid(vscode.version) && semver.gte(vscode.version, '1.68.0'))
}

describe('crossFileContextUtil', function () {
    const fakeCancellationToken: vscode.CancellationToken = {
        isCancellationRequested: false,
        onCancellationRequested: sinon.spy(),
    }

    let mockEditor: vscode.TextEditor

    describe('non supported language should return undefined', function () {
        it('c++', async function () {
            mockEditor = createMockTextEditor('content', 'fileName', 'cpp')
            const actual = await crossFile.fetchSupplementalContextForSrc(mockEditor, fakeCancellationToken)
            assert.strictEqual(actual, undefined)
        })

        it('ruby', async function () {
            mockEditor = createMockTextEditor('content', 'fileName', 'ruby')

            const actual = await crossFile.fetchSupplementalContextForSrc(mockEditor, fakeCancellationToken)

            assert.strictEqual(actual, undefined)
        })
    })

    describe('partial support - control group', function () {
        before(async function () {
            this.timeout(60000)
            userGroupSettings.userGroup = UserGroup.Control
        })

        beforeEach(async function () {
            tempFolder = (await createTestWorkspaceFolder()).uri.fsPath
        })

        afterEach(async function () {
            await closeAllEditors()
        })

        it('should be empty if userGroup is control', async function () {
            if (!shouldRunTheTest()) {
                this.skip()
            }

            const editor = await openATextEditorWithText('content-1', 'file-1.js', tempFolder, { preview: false })
            await openATextEditorWithText('content-2', 'file-2.js', tempFolder, { preview: false })
            await openATextEditorWithText('content-3', 'file-3.js', tempFolder, { preview: false })
            await openATextEditorWithText('content-4', 'file-4.js', tempFolder, { preview: false })

            await assertTabCount(4)

            const actual = await crossFile.fetchSupplementalContextForSrc(editor, fakeCancellationToken)

            assert.ok(actual !== undefined && actual.length === 0)
        })
    })

    describe('partial support - crossfile group', function () {
        before(async function () {
            this.timeout(60000)
            userGroupSettings.userGroup = UserGroup.CrossFile
        })

        beforeEach(async function () {
            tempFolder = (await createTestWorkspaceFolder()).uri.fsPath
        })

        afterEach(async function () {
            await closeAllEditors()
        })

        it('should be non empty if userGroup is crossfile', async function () {
            if (!shouldRunTheTest()) {
                this.skip()
            }

            const editor = await openATextEditorWithText('content-1', 'file-1.js', tempFolder, { preview: false })
            await openATextEditorWithText('content-2', 'file-2.js', tempFolder, { preview: false })
            await openATextEditorWithText('content-3', 'file-3.js', tempFolder, { preview: false })
            await openATextEditorWithText('content-4', 'file-4.js', tempFolder, { preview: false })

            await assertTabCount(4)

            const actual = await crossFile.fetchSupplementalContextForSrc(editor, fakeCancellationToken)

            assert.ok(actual !== undefined && actual.length !== 0)
        })
    })

    describe('full support', function () {
        before(async function () {
            this.timeout(60000)
        })

        beforeEach(async function () {
            tempFolder = (await createTestWorkspaceFolder()).uri.fsPath
        })

        afterEach(async function () {
            sinon.restore()
            await closeAllEditors()
        })

        it('should be non empty', async function () {
            if (!shouldRunTheTest()) {
                this.skip()
            }

            const editor = await openATextEditorWithText('content-1', 'file-1.java', tempFolder)
            await openATextEditorWithText('content-2', 'file-2.java', tempFolder, { preview: false })
            await openATextEditorWithText('content-3', 'file-3.java', tempFolder, { preview: false })
            await openATextEditorWithText('content-4', 'file-4.java', tempFolder, { preview: false })

            await assertTabCount(4)

            const actual = await crossFile.fetchSupplementalContextForSrc(editor, fakeCancellationToken)

            assert.ok(actual?.length !== undefined && actual.length !== 0)
        })
    })
})
