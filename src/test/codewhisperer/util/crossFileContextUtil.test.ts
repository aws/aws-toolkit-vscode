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
import {
    assertTabCount,
    closeAllEditors,
    createTestWorkspaceFolder,
    openATextEditorWithText,
    shuffleList,
} from '../../testUtil'
import { areEqual, normalize } from '../../../shared/utilities/pathUtils'
import * as path from 'path'
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

    describe('getCrossFileCandidate', function () {
        before(async function () {
            this.timeout(60000)
        })

        beforeEach(async function () {
            tempFolder = (await createTestWorkspaceFolder()).uri.fsPath
        })

        afterEach(async function () {
            await closeAllEditors()
        })

        it('should return opened files, exclude test files and sorted ascendingly by file distance', async function () {
            if (!shouldRunTheTest()) {
                this.skip()
            }

            const targetFile = path.join('src', 'service', 'microService', 'CodeWhispererFileContextProvider.java')
            const fileWithDistance3 = path.join('src', 'service', 'CodewhispererRecommendationService.java')
            const fileWithDistance5 = path.join('src', 'util', 'CodeWhispererConstants.java')
            const fileWithDistance6 = path.join('src', 'ui', 'popup', 'CodeWhispererPopupManager.java')
            const fileWithDistance7 = path.join('src', 'ui', 'popup', 'components', 'CodeWhispererPopup.java')
            const fileWithDistance8 = path.join(
                'src',
                'ui',
                'popup',
                'components',
                'actions',
                'AcceptRecommendationAction.java'
            )
            const testFile1 = path.join('test', 'service', 'CodeWhispererFileContextProviderTest.java')
            const testFile2 = path.join('test', 'ui', 'CodeWhispererPopupManagerTest.java')

            const expectedFilePaths = [
                fileWithDistance3,
                fileWithDistance5,
                fileWithDistance6,
                fileWithDistance7,
                fileWithDistance8,
            ]

            const shuffledFilePaths = shuffleList(expectedFilePaths)

            for (const filePath of shuffledFilePaths) {
                await openATextEditorWithText('', filePath, tempFolder, { preview: false })
            }

            await openATextEditorWithText('', testFile1, tempFolder, { preview: false })
            await openATextEditorWithText('', testFile2, tempFolder, { preview: false })
            const editor = await openATextEditorWithText('', targetFile, tempFolder, { preview: false })

            await assertTabCount(shuffledFilePaths.length + 3)

            const actual = await crossFile.getCrossFileCandidates(editor)

            assert.ok(actual.length === 5)
            actual.forEach((actualFile, index) => {
                const expectedFile = path.join(tempFolder, expectedFilePaths[index])
                assert.strictEqual(normalize(expectedFile), normalize(actualFile))
                assert.ok(areEqual(tempFolder, actualFile, expectedFile))
            })
        })
    })

    describe('partial support - control group', function () {
        const fileExtLists: string[] = []

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

        fileExtLists.forEach(fileExt => {
            it('should be empty if userGroup is control', async function () {
                if (!shouldRunTheTest()) {
                    this.skip()
                }

                const editor = await openATextEditorWithText('content-1', `file-1.${fileExt}`, tempFolder)
                await openATextEditorWithText('content-2', `file-2.${fileExt}`, tempFolder, { preview: false })
                await openATextEditorWithText('content-3', `file-3.${fileExt}`, tempFolder, { preview: false })
                await openATextEditorWithText('content-4', `file-4.${fileExt}`, tempFolder, { preview: false })

                await assertTabCount(4)

                const actual = await crossFile.fetchSupplementalContextForSrc(editor, fakeCancellationToken)

                assert.ok(actual?.length !== undefined && actual.length === 0)
            })
        })
    })

    describe('partial support - crossfile group', function () {
        const fileExtLists: string[] = []

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

        fileExtLists.forEach(fileExt => {
            it('should be non empty if usergroup is Crossfile', async function () {
                if (!shouldRunTheTest()) {
                    this.skip()
                }

                const editor = await openATextEditorWithText('content-1', `file-1.${fileExt}`, tempFolder)
                await openATextEditorWithText('content-2', `file-2.${fileExt}`, tempFolder, { preview: false })
                await openATextEditorWithText('content-3', `file-3.${fileExt}`, tempFolder, { preview: false })
                await openATextEditorWithText('content-4', `file-4.${fileExt}`, tempFolder, { preview: false })

                await assertTabCount(4)

                const actual = await crossFile.fetchSupplementalContextForSrc(editor, fakeCancellationToken)

                assert.ok(actual?.length !== undefined && actual.length !== 0)
            })
        })
    })

    describe('full support', function () {
        const fileExtLists = ['java', 'js', 'ts', 'py', 'tsx', 'jsx']

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

        fileExtLists.forEach(fileExt => {
            it('should be non empty', async function () {
                if (!shouldRunTheTest()) {
                    this.skip()
                }

                const editor = await openATextEditorWithText('content-1', `file-1.${fileExt}`, tempFolder)
                await openATextEditorWithText('content-2', `file-2.${fileExt}`, tempFolder, { preview: false })
                await openATextEditorWithText('content-3', `file-3.${fileExt}`, tempFolder, { preview: false })
                await openATextEditorWithText('content-4', `file-4.${fileExt}`, tempFolder, { preview: false })

                await assertTabCount(4)

                const actual = await crossFile.fetchSupplementalContextForSrc(editor, fakeCancellationToken)

                assert.ok(actual?.length !== undefined && actual.length !== 0)
            })
        })
    })
})
