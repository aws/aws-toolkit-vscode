/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as crossFile from 'aws-core-vscode/codewhisperer'
import { aStringWithLineCount, createMockTextEditor } from 'aws-core-vscode/test'
import { crossFileContextConfig } from 'aws-core-vscode/codewhisperer'
import {
    assertTabCount,
    closeAllEditors,
    createTestWorkspaceFolder,
    toTextEditor,
    shuffleList,
    toFile,
} from 'aws-core-vscode/test'
import { areEqual, normalize } from 'aws-core-vscode/shared'
import * as path from 'path'

let tempFolder: string

describe('crossFileContextUtil', function () {
    const fakeCancellationToken: vscode.CancellationToken = {
        isCancellationRequested: false,
        onCancellationRequested: sinon.spy(),
    }

    let mockEditor: vscode.TextEditor

    describe('fetchSupplementalContextForSrc', function () {
        beforeEach(async function () {
            tempFolder = (await createTestWorkspaceFolder()).uri.fsPath
        })

        it('should fetch 3 chunks and each chunk should contains 50 lines', async function () {
            await toTextEditor(aStringWithLineCount(200), 'CrossFile.java', tempFolder, { preview: false })
            const myCurrentEditor = await toTextEditor('', 'TargetFile.java', tempFolder, {
                preview: false,
            })
            const actual = await crossFile.fetchSupplementalContextForSrc(myCurrentEditor, fakeCancellationToken)
            assert.ok(actual)
            assert.ok(actual.supplementalContextItems.length === 3)

            assert.strictEqual(actual.supplementalContextItems[0].content.split('\n').length, 50)
            assert.strictEqual(actual.supplementalContextItems[1].content.split('\n').length, 50)
            assert.strictEqual(actual.supplementalContextItems[2].content.split('\n').length, 50)
        })
    })

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
                await toTextEditor('', filePath, tempFolder, { preview: false })
            }

            await toTextEditor('', testFile1, tempFolder, { preview: false })
            await toTextEditor('', testFile2, tempFolder, { preview: false })
            const editor = await toTextEditor('', targetFile, tempFolder, { preview: false })

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

    describe.skip('partial support - control group', function () {
        const fileExtLists: string[] = []

        before(async function () {
            this.timeout(60000)
        })

        beforeEach(async function () {
            tempFolder = (await createTestWorkspaceFolder()).uri.fsPath
        })

        afterEach(async function () {
            await closeAllEditors()
        })

        fileExtLists.forEach((fileExt) => {
            it('should be empty if userGroup is control', async function () {
                const editor = await toTextEditor('content-1', `file-1.${fileExt}`, tempFolder)
                await toTextEditor('content-2', `file-2.${fileExt}`, tempFolder, { preview: false })
                await toTextEditor('content-3', `file-3.${fileExt}`, tempFolder, { preview: false })
                await toTextEditor('content-4', `file-4.${fileExt}`, tempFolder, { preview: false })

                await assertTabCount(4)

                const actual = await crossFile.fetchSupplementalContextForSrc(editor, fakeCancellationToken)

                assert.ok(actual && actual.supplementalContextItems.length === 0)
            })
        })
    })

    describe.skip('partial support - crossfile group', function () {
        const fileExtLists: string[] = []

        before(async function () {
            this.timeout(60000)
        })

        beforeEach(async function () {
            tempFolder = (await createTestWorkspaceFolder()).uri.fsPath
        })

        afterEach(async function () {
            await closeAllEditors()
        })

        fileExtLists.forEach((fileExt) => {
            it('should be non empty if usergroup is Crossfile', async function () {
                const editor = await toTextEditor('content-1', `file-1.${fileExt}`, tempFolder)
                await toTextEditor('content-2', `file-2.${fileExt}`, tempFolder, { preview: false })
                await toTextEditor('content-3', `file-3.${fileExt}`, tempFolder, { preview: false })
                await toTextEditor('content-4', `file-4.${fileExt}`, tempFolder, { preview: false })

                await assertTabCount(4)

                const actual = await crossFile.fetchSupplementalContextForSrc(editor, fakeCancellationToken)

                assert.ok(actual && actual.supplementalContextItems.length !== 0)
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

        fileExtLists.forEach((fileExt) => {
            it('should be non empty', async function () {
                const editor = await toTextEditor('content-1', `file-1.${fileExt}`, tempFolder)
                await toTextEditor('content-2', `file-2.${fileExt}`, tempFolder, { preview: false })
                await toTextEditor('content-3', `file-3.${fileExt}`, tempFolder, { preview: false })
                await toTextEditor('content-4', `file-4.${fileExt}`, tempFolder, { preview: false })

                await assertTabCount(4)

                const actual = await crossFile.fetchSupplementalContextForSrc(editor, fakeCancellationToken)

                assert.ok(actual && actual.supplementalContextItems.length !== 0)
            })
        })
    })

    describe('splitFileToChunks', function () {
        beforeEach(async function () {
            tempFolder = (await createTestWorkspaceFolder()).uri.fsPath
        })

        it('should split file to a chunk of 2 lines', async function () {
            const filePath = path.join(tempFolder, 'file.txt')
            await toFile('line_1\nline_2\nline_3\nline_4\nline_5\nline_6\nline_7', filePath)

            const chunks = await crossFile.splitFileToChunks(filePath, 2)

            assert.strictEqual(chunks.length, 4)
            assert.strictEqual(chunks[0].content, 'line_1\nline_2')
            assert.strictEqual(chunks[1].content, 'line_3\nline_4')
            assert.strictEqual(chunks[2].content, 'line_5\nline_6')
            assert.strictEqual(chunks[3].content, 'line_7')
        })

        it('should split file to a chunk of 5 lines', async function () {
            const filePath = path.join(tempFolder, 'file.txt')
            await toFile('line_1\nline_2\nline_3\nline_4\nline_5\nline_6\nline_7', filePath)

            const chunks = await crossFile.splitFileToChunks(filePath, 5)

            assert.strictEqual(chunks.length, 2)
            assert.strictEqual(chunks[0].content, 'line_1\nline_2\nline_3\nline_4\nline_5')
            assert.strictEqual(chunks[1].content, 'line_6\nline_7')
        })

        it('codewhisperer crossfile config should use 50 lines', async function () {
            const filePath = path.join(tempFolder, 'file.txt')
            await toFile(aStringWithLineCount(210), filePath)

            const chunks = await crossFile.splitFileToChunks(filePath, crossFileContextConfig.numberOfLinesEachChunk)

            // (210 / 50) + 1
            assert.strictEqual(chunks.length, 5)
            // line0 -> line49
            assert.strictEqual(chunks[0].content, aStringWithLineCount(50, 0))
            // line50 -> line99
            assert.strictEqual(chunks[1].content, aStringWithLineCount(50, 50))
            // line100 -> line149
            assert.strictEqual(chunks[2].content, aStringWithLineCount(50, 100))
            // line150 -> line199
            assert.strictEqual(chunks[3].content, aStringWithLineCount(50, 150))
            // line 200 -> line209
            assert.strictEqual(chunks[4].content, aStringWithLineCount(10, 200))
        })

        it('linkChunks should add another chunk which will link to the first chunk and chunk.nextContent should reflect correct value', async function () {
            const filePath = path.join(tempFolder, 'file.txt')
            await toFile(aStringWithLineCount(210), filePath)

            const chunks = await crossFile.splitFileToChunks(filePath, crossFileContextConfig.numberOfLinesEachChunk)
            const linkedChunks = crossFile.linkChunks(chunks)

            // 210 / 50 + 2
            assert.strictEqual(linkedChunks.length, 6)

            // 0th
            assert.strictEqual(linkedChunks[0].content, aStringWithLineCount(3, 0))
            assert.strictEqual(linkedChunks[0].nextContent, aStringWithLineCount(50, 0))

            // 1st
            assert.strictEqual(linkedChunks[1].content, aStringWithLineCount(50, 0))
            assert.strictEqual(linkedChunks[1].nextContent, aStringWithLineCount(50, 50))

            // 2nd
            assert.strictEqual(linkedChunks[2].content, aStringWithLineCount(50, 50))
            assert.strictEqual(linkedChunks[2].nextContent, aStringWithLineCount(50, 100))

            // 3rd
            assert.strictEqual(linkedChunks[3].content, aStringWithLineCount(50, 100))
            assert.strictEqual(linkedChunks[3].nextContent, aStringWithLineCount(50, 150))

            // 4th
            assert.strictEqual(linkedChunks[4].content, aStringWithLineCount(50, 150))
            assert.strictEqual(linkedChunks[4].nextContent, aStringWithLineCount(10, 200))

            // 5th
            assert.strictEqual(linkedChunks[5].content, aStringWithLineCount(10, 200))
            assert.strictEqual(linkedChunks[5].nextContent, aStringWithLineCount(10, 200))
        })
    })
})
