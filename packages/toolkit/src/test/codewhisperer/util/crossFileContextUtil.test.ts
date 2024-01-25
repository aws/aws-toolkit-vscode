/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
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
    toFile,
} from '../../testUtil'
import { areEqual, normalize } from '../../../shared/utilities/pathUtils'
import * as path from 'path'
import { crossFileContextConfig } from '../../../codewhisperer/models/constants'

const userGroupSettings = CodeWhispererUserGroupSettings.instance
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

        describe('should fetch 3 chunks and each chunk should contains 10 lines', function () {
            async function assertCorrectCodeChunk() {
                await openATextEditorWithText(sampleFileOf60Lines, 'CrossFile.java', tempFolder, { preview: false })
                const myCurrentEditor = await openATextEditorWithText('', 'TargetFile.java', tempFolder, {
                    preview: false,
                })
                const actual = await crossFile.fetchSupplementalContextForSrc(myCurrentEditor, fakeCancellationToken)
                assert.ok(actual)
                assert.ok(actual.supplementalContextItems.length === 3)

                assert.strictEqual(actual.supplementalContextItems[0].content.split('\n').length, 10)
                assert.strictEqual(actual.supplementalContextItems[1].content.split('\n').length, 10)
                assert.strictEqual(actual.supplementalContextItems[2].content.split('\n').length, 10)
            }

            it('control group', async function () {
                CodeWhispererUserGroupSettings.instance.userGroup = UserGroup.Control
                await assertCorrectCodeChunk()
            })

            it('treatment group', async function () {
                CodeWhispererUserGroupSettings.instance.userGroup = UserGroup.CrossFile
                await assertCorrectCodeChunk()
            })
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
                const editor = await openATextEditorWithText('content-1', `file-1.${fileExt}`, tempFolder)
                await openATextEditorWithText('content-2', `file-2.${fileExt}`, tempFolder, { preview: false })
                await openATextEditorWithText('content-3', `file-3.${fileExt}`, tempFolder, { preview: false })
                await openATextEditorWithText('content-4', `file-4.${fileExt}`, tempFolder, { preview: false })

                await assertTabCount(4)

                const actual = await crossFile.fetchSupplementalContextForSrc(editor, fakeCancellationToken)

                assert.ok(actual && actual.supplementalContextItems.length === 0)
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
                const editor = await openATextEditorWithText('content-1', `file-1.${fileExt}`, tempFolder)
                await openATextEditorWithText('content-2', `file-2.${fileExt}`, tempFolder, { preview: false })
                await openATextEditorWithText('content-3', `file-3.${fileExt}`, tempFolder, { preview: false })
                await openATextEditorWithText('content-4', `file-4.${fileExt}`, tempFolder, { preview: false })

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

        fileExtLists.forEach(fileExt => {
            it('should be non empty', async function () {
                const editor = await openATextEditorWithText('content-1', `file-1.${fileExt}`, tempFolder)
                await openATextEditorWithText('content-2', `file-2.${fileExt}`, tempFolder, { preview: false })
                await openATextEditorWithText('content-3', `file-3.${fileExt}`, tempFolder, { preview: false })
                await openATextEditorWithText('content-4', `file-4.${fileExt}`, tempFolder, { preview: false })

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

            const chunks = crossFile.splitFileToChunks(filePath, 2)

            assert.strictEqual(chunks.length, 4)
            assert.strictEqual(chunks[0].content, 'line_1\nline_2')
            assert.strictEqual(chunks[1].content, 'line_3\nline_4')
            assert.strictEqual(chunks[2].content, 'line_5\nline_6')
            assert.strictEqual(chunks[3].content, 'line_7')
        })

        it('should split file to a chunk of 5 lines', async function () {
            const filePath = path.join(tempFolder, 'file.txt')
            await toFile('line_1\nline_2\nline_3\nline_4\nline_5\nline_6\nline_7', filePath)

            const chunks = crossFile.splitFileToChunks(filePath, 5)

            assert.strictEqual(chunks.length, 2)
            assert.strictEqual(chunks[0].content, 'line_1\nline_2\nline_3\nline_4\nline_5')
            assert.strictEqual(chunks[1].content, 'line_6\nline_7')
        })

        it('codewhisperer crossfile config should use 10 lines', async function () {
            const filePath = path.join(tempFolder, 'file.txt')
            await toFile(sampleFileOf60Lines, filePath)

            const chunks = crossFile.splitFileToChunks(filePath, crossFileContextConfig.numberOfLinesEachChunk)
            assert.strictEqual(chunks.length, 6)
        })
    })
})

const sampleFileOf60Lines = `import java.util.List;
// we need this comment on purpose because chunk will be trimed right, adding this to avoid trimRight and make assertion easier
/**
 * 
 * 
 * 
 * 
 * 
 **/
class Main {
    public static void main(String[] args) {
        Calculator calculator = new Calculator();
        calculator.add(1, 2);
        calculator.subtract(1, 2);
        calculator.multiply(1, 2);
        calculator.divide(1, 2);
        calculator.remainder(1, 2);
    }
}
//
class Calculator {
    public Calculator() {
        System.out.println("constructor");
    }
//
    public add(int num1, int num2) {
        System.out.println("add");
        return num1 + num2;
    }
//
    public subtract(int num1, int num2) {
        System.out.println("subtract");
        return num1 - num2;
    }
//
    public multiply(int num1, int num2) {
        System.out.println("multiply");
        return num1 * num2;    
    }
//
    public divide(int num1, int num2) {
        System.out.println("divide");
        return num1 / num2;
    }
//
    public remainder(int num1, int num2) {
        System.out.println("remainder");
        return num1 % num2;
    }
//
    public power(int num1, int num2) {
        System.out.println("power");
        return (int) Math.pow(num1, num2);
    }
//
    public squareRoot(int num1) {
        System.out.println("squareRoot");
        return (int) Math.sqrt(num1);
    }
}`
