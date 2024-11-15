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
        const mockLeftDocument = {
            getText: () => 'line1\nline2',
            uri: vscode.Uri.file('test.txt'),
            fileName: 'test.txt',
        }

        const mockRightDocument = {
            getText: () => 'line1\nline3\nline4\nline5',
            uri: vscode.Uri.file('test.txt'),
            fileName: 'test.txt',
        }

        it('returns 0 added or removed chars and lines for the same file', async () => {
            sandbox.stub(FileSystem.prototype, 'exists').resolves(true)
            sandbox.stub(vscode.workspace, 'openTextDocument').resolves(mockLeftDocument as unknown as TextDocument)

            const { changes, charsAdded, linesAdded, charsRemoved, linesRemoved } = await computeDiff(
                filePath,
                filePath,
                tabId
            )

            const expectedChanges = [
                {
                    count: 2,
                    value: 'line1\nline2',
                },
            ]

            assert.deepEqual(changes, expectedChanges)
            assert.equal(charsAdded, 0)
            assert.equal(linesAdded, 0)
            assert.equal(charsRemoved, 0)
            assert.equal(linesRemoved, 0)
        })

        it('returns expected added or removed chars and lines for different files', async () => {
            sandbox.stub(FileSystem.prototype, 'exists').resolves(true)
            sandbox
                .stub(vscode.workspace, 'openTextDocument')
                .onFirstCall()
                .resolves(mockLeftDocument as unknown as TextDocument)
                .onSecondCall()
                .resolves(mockRightDocument as unknown as TextDocument)

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
                    count: 1,
                    added: undefined,
                    removed: true,
                    value: 'line2',
                },
                {
                    count: 3,
                    added: true,
                    removed: undefined,
                    value: 'line3\nline4\nline5',
                },
            ]

            assert.deepEqual(changes, expectedChanges)
            assert.equal(charsAdded, 15)
            assert.equal(linesAdded, 3)
            assert.equal(charsRemoved, 5)
            assert.equal(linesRemoved, 1)
        })
    })
})
