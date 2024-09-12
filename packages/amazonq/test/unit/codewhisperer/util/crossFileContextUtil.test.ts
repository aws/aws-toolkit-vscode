/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as crossFile from 'aws-core-vscode/codewhisperer'
import { createMockTextEditor } from 'aws-core-vscode/test'
import {
    CodeWhispererUserGroupSettings,
    UserGroup,
    crossFileContextConfig,
    neighborFiles,
} from 'aws-core-vscode/codewhisperer'
import {
    assertTabCount,
    closeAllEditors,
    createTestWorkspaceFolder,
    openATextEditorWithText,
    shuffleList,
    toFile,
} from 'aws-core-vscode/test'
import { areEqual, getFileDistance, normalize } from 'aws-core-vscode/shared'
import * as path from 'path'

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

        fileExtLists.forEach((fileExt) => {
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

        fileExtLists.forEach((fileExt) => {
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

        fileExtLists.forEach((fileExt) => {
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

        it('codewhisperer crossfile config should use 10 lines', async function () {
            const filePath = path.join(tempFolder, 'file.txt')
            await toFile(sampleFileOf60Lines, filePath)

            const chunks = await crossFile.splitFileToChunks(filePath, crossFileContextConfig.numberOfLinesEachChunk)
            assert.strictEqual(chunks.length, 6)
        })
    })
})

/**
 *     1. A: root/util/context/a.ts
 *     2. B: root/util/b.ts
 *     3. C: root/util/service/c.ts
 *     4. D: root/d.ts
 *     5. E: root/util/context/e.ts
 *     6. F: root/util/foo/bar/baz/f.ts
 *
 *   neighborfiles(A) = [B, E]
 *   neighborfiles(B) = [A, C, D, E]
 *   neighborfiles(C) = [B,]
 *   neighborfiles(D) = [B,]
 *   neighborfiles(E) = [A, B]
 *   neighborfiles(F) = []
 *
 *      A B C D E F
 *   A  x 1 2 2 0 4
 *   B  1 x 1 1 1 3
 *   C  2 1 x 2 2 4
 *   D  2 1 2 x 2 4
 *   E  0 1 2 2 x 4
 *   F  4 3 4 4 4 x
 */
describe('neighborFiles', function () {
    it('neighbor file default definition', function () {
        assert.strictEqual(crossFileContextConfig.neighborFileDistance, 1)
    })

    it('return files with distance less than or equal to 1', async function () {
        const ws = await createTestWorkspaceFolder('root')
        const rootUri = ws.uri.fsPath

        const a = path.join(rootUri, 'util', 'context', 'a.java')
        const b = path.join(rootUri, 'util', 'b.java')
        const c = path.join(rootUri, 'util', 'service', 'c.java')
        const d = path.join(rootUri, 'd.java')
        const e = path.join(rootUri, 'util', 'context', 'e.java')
        const f = path.join(rootUri, 'util', 'foo', 'bar', 'baz', 'f.java')

        await toFile('a', a)
        await toFile('b', b)
        await toFile('c', c)
        await toFile('d', d)
        await toFile('e', e)
        await toFile('f', f)

        const neighborOfA = await neighborFiles(a, 1, { workspaceFolders: [ws] })
        const neighborOfB = await neighborFiles(b, 1, { workspaceFolders: [ws] })
        const neighborOfC = await neighborFiles(c, 1, { workspaceFolders: [ws] })
        const neighborOfD = await neighborFiles(d, 1, { workspaceFolders: [ws] })
        const neighborOfE = await neighborFiles(e, 1, { workspaceFolders: [ws] })
        const neighborOfF = await neighborFiles(f, 1, { workspaceFolders: [ws] })

        assert.deepStrictEqual(neighborOfA, new Set([b, e]))
        assert.strictEqual(getFileDistance(a, b), 1)
        assert.strictEqual(getFileDistance(a, e), 0)

        assert.deepStrictEqual(neighborOfB, new Set([a, c, d, e]))
        assert.strictEqual(getFileDistance(b, c), 1)
        assert.strictEqual(getFileDistance(b, d), 1)
        assert.strictEqual(getFileDistance(b, e), 1)

        assert.deepStrictEqual(neighborOfC, new Set([b]))
        assert.deepStrictEqual(neighborOfD, new Set([b]))
        assert.deepStrictEqual(neighborOfE, new Set([a, b]))

        assert.deepStrictEqual(neighborOfF, new Set([]))
        assert.strictEqual(getFileDistance(f, a), 4)
        assert.strictEqual(getFileDistance(f, b), 3)
        assert.strictEqual(getFileDistance(f, c), 4)
        assert.strictEqual(getFileDistance(f, d), 4)
        assert.strictEqual(getFileDistance(f, e), 4)
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
