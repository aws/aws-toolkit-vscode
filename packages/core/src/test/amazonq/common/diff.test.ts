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
import { createAmazonQUri, getFileDiffUris, getOriginalFileUri, openDeletedDiff, openDiff } from '../../../amazonq'
import { FileSystem } from '../../../shared/fs/fs'

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

            const expectedPath = vscode.Uri.file(filePath)
            assert.ok(executeCommandSpy.calledWith('vscode.open', expectedPath, {}, `${name} (Deleted)`))
        })

        it('file does not exists locally', async () => {
            sandbox.stub(FileSystem.prototype, 'exists').resolves(false)
            await openDeletedDiff(filePath, name, tabId)

            const expectedPath = createAmazonQUri('empty', tabId)
            assert.ok(executeCommandSpy.calledWith('vscode.open', expectedPath, {}, `${name} (Deleted)`))
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
})
