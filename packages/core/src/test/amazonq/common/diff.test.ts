/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TODO: Move this file to amazonq/test/unit when we can figure out how to spy on vscode imports from amazonq.
 *
 * See TESTPLAN.md#Stubbing VSCode outside of core
 */
import assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import sinon from 'sinon'
import {
    createAmazonQUri,
    getFileDiffUris,
    getOriginalFileUri,
    openDeletedDiff,
    openDiff,
    computeDiff,
} from '../../../amazonq'
import { FileSystem } from '../../../shared/fs/fs'
import { TextDocument } from 'vscode'

describe('diff', () => {
    const filePath = path.join('/', 'foo', 'fi')
    const rightPath = path.join('foo', 'fee')
    const tabId = '0'

    let sandbox: sinon.SinonSandbox
    let executeCommandSpy: sinon.SinonSpy

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        executeCommandSpy = sandbox.spy(vscode.commands, 'executeCommand')
    })

    afterEach(() => {
        executeCommandSpy.restore()
        sandbox.restore()
    })

    describe('openDiff', () => {
        it('file exists locally', async () => {
            sandbox.stub(FileSystem.prototype, 'exists').resolves(true)
            await openDiff(filePath, rightPath, tabId)

            const leftExpected = vscode.Uri.file(filePath)
            const rightExpected = createAmazonQUri(rightPath, tabId)
            assert.ok(executeCommandSpy.calledWith('vscode.diff', leftExpected, rightExpected))
        })

        it('file does not exists locally', async () => {
            sandbox.stub(FileSystem.prototype, 'exists').resolves(false)
            await openDiff(filePath, rightPath, tabId)

            const leftExpected = await getOriginalFileUri(filePath, tabId)
            const rightExpected = createAmazonQUri(rightPath, tabId)
            assert.ok(executeCommandSpy.calledWith('vscode.diff', leftExpected, rightExpected))
        })
    })

    describe('openDeletedDiff', () => {
        const name = 'foo'

        it('file exists locally', async () => {
            sandbox.stub(FileSystem.prototype, 'exists').resolves(true)
            await openDeletedDiff(filePath, name, tabId)

            const leftExpected = vscode.Uri.file(filePath)
            const rightExpected = createAmazonQUri('empty', tabId)
            assert.ok(executeCommandSpy.calledWith('vscode.diff', leftExpected, rightExpected, `${name} (Deleted)`))
        })

        it('file does not exists locally', async () => {
            sandbox.stub(FileSystem.prototype, 'exists').resolves(false)
            await openDeletedDiff(filePath, name, tabId)

            const leftExpected = createAmazonQUri('empty', tabId)
            const rightExpected = createAmazonQUri('empty', tabId)
            assert.ok(executeCommandSpy.calledWith('vscode.diff', leftExpected, rightExpected, `${name} (Deleted)`))
        })
    })

    describe('getOriginalFileUri', () => {
        it('file exists locally', async () => {
            sandbox.stub(FileSystem.prototype, 'exists').resolves(true)
            assert.deepStrictEqual((await getOriginalFileUri(filePath, tabId)).fsPath, filePath)
        })

        it('file does not exists locally', async () => {
            sandbox.stub(FileSystem.prototype, 'exists').resolves(false)
            const expected = createAmazonQUri('empty', tabId)
            assert.deepStrictEqual(await getOriginalFileUri(filePath, tabId), expected)
        })
    })

    describe('getFileDiffUris', () => {
        it('file exists locally', async () => {
            sandbox.stub(FileSystem.prototype, 'exists').resolves(true)

            const { left, right } = await getFileDiffUris(filePath, rightPath, tabId)

            const leftExpected = vscode.Uri.file(filePath)
            assert.deepStrictEqual(left, leftExpected)

            const rightExpected = createAmazonQUri(rightPath, tabId)
            assert.deepStrictEqual(right, rightExpected)
        })

        it('file does not exists locally', async () => {
            sandbox.stub(FileSystem.prototype, 'exists').resolves(false)
            const { left, right } = await getFileDiffUris(filePath, rightPath, tabId)

            const leftExpected = await getOriginalFileUri(filePath, tabId)
            assert.deepStrictEqual(left, leftExpected)

            const rightExpected = createAmazonQUri(rightPath, tabId)
            assert.deepStrictEqual(right, rightExpected)
        })
    })

    describe('computeDiff', () => {
        const mockOriginalDocument = {
            getText: () => 'line1\nline2\nline3\n',
            uri: vscode.Uri.file('test.txt'),
            fileName: 'test.txt',
        }

        it('returns no addition or removal for the same file', async () => {
            sandbox.stub(FileSystem.prototype, 'exists').resolves(true)
            sandbox.stub(vscode.workspace, 'openTextDocument').resolves(mockOriginalDocument as unknown as TextDocument)

            const { changes, charsAdded, linesAdded, charsRemoved, linesRemoved } = await computeDiff(
                filePath,
                filePath,
                tabId
            )

            const expectedChanges = [
                {
                    count: 3,
                    value: 'line1\nline2\nline3\n',
                },
            ]

            assert.deepEqual(changes, expectedChanges)
            assert.equal(charsAdded, 0)
            assert.equal(linesAdded, 0)
            assert.equal(charsRemoved, 0)
            assert.equal(linesRemoved, 0)
        })

        it('counts insertion of new line', async () => {
            const mockInsertionDocument = {
                getText: () => 'line1\ninserted\nline2\nline3\n',
                uri: vscode.Uri.file('test.txt'),
                fileName: 'test.txt',
            }
            sandbox.stub(FileSystem.prototype, 'exists').resolves(true)
            sandbox
                .stub(vscode.workspace, 'openTextDocument')
                .onFirstCall()
                .resolves(mockOriginalDocument as unknown as TextDocument)
                .onSecondCall()
                .resolves(mockInsertionDocument as unknown as TextDocument)

            const { changes, charsAdded, linesAdded, charsRemoved, linesRemoved } = await computeDiff(
                filePath,
                rightPath,
                tabId
            )

            const expectedChanges = [
                {
                    count: 1,
                    value: 'line1\n',
                },
                {
                    added: true,
                    count: 1,
                    removed: undefined,
                    value: 'inserted\n',
                },
                {
                    count: 2,
                    value: 'line2\nline3\n',
                },
            ]

            assert.deepEqual(changes, expectedChanges)
            assert.equal(charsAdded, 8)
            assert.equal(linesAdded, 1)
            assert.equal(charsRemoved, 0)
            assert.equal(linesRemoved, 0)
        })

        it('counts insertion of multiple lines', async () => {
            const mockMultipleInsertionDocument = {
                getText: () => 'line1\ninserted1\ninserted2\nline2\nline3\ninserted3\n',
                uri: vscode.Uri.file('test.txt'),
                fileName: 'test.txt',
            }
            sandbox.stub(FileSystem.prototype, 'exists').resolves(true)
            sandbox
                .stub(vscode.workspace, 'openTextDocument')
                .onFirstCall()
                .resolves(mockOriginalDocument as unknown as TextDocument)
                .onSecondCall()
                .resolves(mockMultipleInsertionDocument as unknown as TextDocument)

            const { changes, charsAdded, linesAdded, charsRemoved, linesRemoved } = await computeDiff(
                filePath,
                rightPath,
                tabId
            )

            const expectedChanges = [
                {
                    count: 1,
                    value: 'line1\n',
                },
                {
                    added: true,
                    count: 2,
                    removed: undefined,
                    value: 'inserted1\ninserted2\n',
                },
                {
                    count: 2,
                    value: 'line2\nline3\n',
                },
                {
                    added: true,
                    count: 1,
                    removed: undefined,
                    value: 'inserted3\n',
                },
            ]

            assert.deepEqual(changes, expectedChanges)
            assert.equal(charsAdded, 27)
            assert.equal(linesAdded, 3)
            assert.equal(charsRemoved, 0)
            assert.equal(linesRemoved, 0)
        })

        it('counts modification of existing line', async () => {
            const mockModificationDocument = {
                getText: () => 'line1\nmodified\nline3\n',
                uri: vscode.Uri.file('test.txt'),
                fileName: 'test.txt',
            }
            sandbox.stub(FileSystem.prototype, 'exists').resolves(true)
            sandbox
                .stub(vscode.workspace, 'openTextDocument')
                .onFirstCall()
                .resolves(mockOriginalDocument as unknown as TextDocument)
                .onSecondCall()
                .resolves(mockModificationDocument as unknown as TextDocument)

            const { changes, charsAdded, linesAdded, charsRemoved, linesRemoved } = await computeDiff(
                filePath,
                rightPath,
                tabId
            )

            const expectedChanges = [
                {
                    count: 1,
                    value: 'line1\n',
                },
                {
                    added: undefined,
                    count: 1,
                    removed: true,
                    value: 'line2\n',
                },
                {
                    added: true,
                    count: 1,
                    removed: undefined,
                    value: 'modified\n',
                },
                {
                    count: 1,
                    value: 'line3\n',
                },
            ]

            assert.deepEqual(changes, expectedChanges)
            assert.equal(charsAdded, 8)
            assert.equal(linesAdded, 1)
            assert.equal(charsRemoved, 5)
            assert.equal(linesRemoved, 1)
        })

        it('counts deletion of existing line', async () => {
            const mockDeletionDocument = {
                getText: () => 'line1\nline3\n',
                uri: vscode.Uri.file('test.txt'),
                fileName: 'test.txt',
            }
            sandbox.stub(FileSystem.prototype, 'exists').resolves(true)
            sandbox
                .stub(vscode.workspace, 'openTextDocument')
                .onFirstCall()
                .resolves(mockOriginalDocument as unknown as TextDocument)
                .onSecondCall()
                .resolves(mockDeletionDocument as unknown as TextDocument)

            const { changes, charsAdded, linesAdded, charsRemoved, linesRemoved } = await computeDiff(
                filePath,
                rightPath,
                tabId
            )

            const expectedChanges = [
                {
                    count: 1,
                    value: 'line1\n',
                },
                {
                    added: undefined,
                    count: 1,
                    removed: true,
                    value: 'line2\n',
                },
                {
                    count: 1,
                    value: 'line3\n',
                },
            ]

            assert.deepEqual(changes, expectedChanges)
            assert.equal(charsAdded, 0)
            assert.equal(linesAdded, 0)
            assert.equal(charsRemoved, 5)
            assert.equal(linesRemoved, 1)
        })

        it('counts deletion of existing line and then adding a new line', async () => {
            const mockDeletionAndAdditionDocument = {
                getText: () => 'line1\nline3\nline4\n',
                uri: vscode.Uri.file('test.txt'),
                fileName: 'test.txt',
            }
            sandbox.stub(FileSystem.prototype, 'exists').resolves(true)
            sandbox
                .stub(vscode.workspace, 'openTextDocument')
                .onFirstCall()
                .resolves(mockOriginalDocument as unknown as TextDocument)
                .onSecondCall()
                .resolves(mockDeletionAndAdditionDocument as unknown as TextDocument)

            const { changes, charsAdded, linesAdded, charsRemoved, linesRemoved } = await computeDiff(
                filePath,
                rightPath,
                tabId
            )

            const expectedChanges = [
                {
                    count: 1,
                    value: 'line1\n',
                },
                {
                    added: undefined,
                    count: 1,
                    removed: true,
                    value: 'line2\n',
                },
                {
                    count: 1,
                    value: 'line3\n',
                },
                {
                    added: true,
                    count: 1,
                    removed: undefined,
                    value: 'line4\n',
                },
            ]

            assert.deepEqual(changes, expectedChanges)
            assert.equal(charsAdded, 5)
            assert.equal(linesAdded, 1)
            assert.equal(charsRemoved, 5)
            assert.equal(linesRemoved, 1)
        })

        it('counts a new empty line', async () => {
            const mockEmptyLineDocument = {
                getText: () => 'line1\nline2\n\nline3\n',
                uri: vscode.Uri.file('test.txt'),
                fileName: 'test.txt',
            }
            sandbox.stub(FileSystem.prototype, 'exists').resolves(true)
            sandbox
                .stub(vscode.workspace, 'openTextDocument')
                .onFirstCall()
                .resolves(mockOriginalDocument as unknown as TextDocument)
                .onSecondCall()
                .resolves(mockEmptyLineDocument as unknown as TextDocument)

            const { changes, charsAdded, linesAdded, charsRemoved, linesRemoved } = await computeDiff(
                filePath,
                rightPath,
                tabId
            )

            const expectedChanges = [
                {
                    count: 2,
                    value: 'line1\nline2\n',
                },
                {
                    added: true,
                    count: 1,
                    removed: undefined,
                    value: '\n',
                },
                {
                    count: 1,
                    value: 'line3\n',
                },
            ]

            assert.deepEqual(changes, expectedChanges)
            assert.equal(charsAdded, 0)
            assert.equal(linesAdded, 1)
            assert.equal(charsRemoved, 0)
            assert.equal(linesRemoved, 0)
        })

        it('ignores leading and trailing whitespaces', async () => {
            const mockWhitespaceDocument = {
                getText: () => '   line1   \n   line2   \n   line3   \n',
                uri: vscode.Uri.file('test.txt'),
                fileName: 'test.txt',
            }
            sandbox.stub(FileSystem.prototype, 'exists').resolves(true)
            sandbox
                .stub(vscode.workspace, 'openTextDocument')
                .onFirstCall()
                .resolves(mockOriginalDocument as unknown as TextDocument)
                .onSecondCall()
                .resolves(mockWhitespaceDocument as unknown as TextDocument)

            const { changes, charsAdded, linesAdded, charsRemoved, linesRemoved } = await computeDiff(
                filePath,
                rightPath,
                tabId
            )

            const expectedChanges = [
                {
                    count: 3,
                    value: 'line1\nline2\nline3\n',
                },
            ]

            assert.deepEqual(changes, expectedChanges)
            assert.equal(charsAdded, 0)
            assert.equal(linesAdded, 0)
            assert.equal(charsRemoved, 0)
            assert.equal(linesRemoved, 0)
        })
    })
})
