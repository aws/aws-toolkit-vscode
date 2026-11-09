/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import assert from 'assert'
import { createTempUrisForDiff } from '../../../shared/utilities/textDocumentUtilities'
import { DiffContentProvider } from '../../../amazonq/commons/controllers/diffContentProvider'
import fs from '../../../shared/fs/fs'

describe('textDocumentUtilities', () => {
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('createTempUrisForDiff', () => {
        const testScheme = 'test-scheme'
        const testFilePath = '/path/to/testFile.js'
        const testFileContent = 'line 1\nline 2\nline 3\nline 4\nline 5'
        const testMessage = {
            code: 'new line 3',
        }
        const testSelection = new vscode.Selection(
            new vscode.Position(2, 0), // Start at line 3 (index 2)
            new vscode.Position(2, 6) // End at line 3 (index 2)
        )

        let diffProvider: DiffContentProvider
        let fsReadFileTextStub: sinon.SinonStub

        beforeEach(() => {
            diffProvider = new DiffContentProvider()
            sandbox.stub(diffProvider, 'registerContent')
            fsReadFileTextStub = sandbox.stub(fs, 'readFileText').resolves(testFileContent)
        })

        it('should create URIs with the correct scheme and file name', async () => {
            const [originalUri, modifiedUri] = await createTempUrisForDiff(
                testFilePath,
                undefined,
                testMessage,
                testSelection,
                testScheme,
                diffProvider
            )

            assert.strictEqual(originalUri.scheme, testScheme)
            assert.strictEqual(modifiedUri.scheme, testScheme)
            assert.ok(originalUri.path.includes('testFile_original-'))
            assert.ok(modifiedUri.path.includes('testFile_proposed-'))
        })

        it('should use provided fileText instead of reading from file when available', async () => {
            const providedFileText = 'provided line 1\nprovided line 2\nprovided line 3'

            await createTempUrisForDiff(
                testFilePath,
                providedFileText,
                testMessage,
                testSelection,
                testScheme,
                diffProvider
            )

            // Verify fs.readFileText was not called
            assert.strictEqual(fsReadFileTextStub.called, false)

            // Verify the diffProvider was called with the provided content
            const registerContentCalls = (diffProvider.registerContent as sinon.SinonStub).getCalls()
            assert.strictEqual(registerContentCalls.length, 2)
            assert.strictEqual(registerContentCalls[0].args[1], providedFileText)
        })

        it('should read from file when fileText is not provided', async () => {
            await createTempUrisForDiff(testFilePath, undefined, testMessage, testSelection, testScheme, diffProvider)

            // Verify fs.readFileText was called with the correct path
            assert.strictEqual(fsReadFileTextStub.calledWith(testFilePath), true)

            // Verify the diffProvider was called with the file content
            const registerContentCalls = (diffProvider.registerContent as sinon.SinonStub).getCalls()
            assert.strictEqual(registerContentCalls.length, 2)
            assert.strictEqual(registerContentCalls[0].args[1], testFileContent)
        })

        it('should create modified content by replacing the selected lines', async () => {
            await createTempUrisForDiff(
                testFilePath,
                testFileContent,
                testMessage,
                testSelection,
                testScheme,
                diffProvider
            )

            // Verify the diffProvider was called with the correct modified content
            const registerContentCalls = (diffProvider.registerContent as sinon.SinonStub).getCalls()
            assert.strictEqual(registerContentCalls.length, 2)

            // First call is for original content
            assert.strictEqual(registerContentCalls[0].args[1], testFileContent)

            // Second call is for modified content
            const expectedModifiedContent = 'line 1\nline 2\nnew line 3\nline 4\nline 5'
            assert.strictEqual(registerContentCalls[1].args[1], expectedModifiedContent)
        })

        it('should handle multi-line selections correctly', async () => {
            // Selection spanning multiple lines (lines 2-4)
            const multiLineSelection = new vscode.Selection(
                new vscode.Position(1, 0), // Start at line 2 (index 1)
                new vscode.Position(3, 6) // End at line 4 (index 3)
            )

            await createTempUrisForDiff(
                testFilePath,
                testFileContent,
                testMessage,
                multiLineSelection,
                testScheme,
                diffProvider
            )

            // Verify the diffProvider was called with the correct modified content
            const registerContentCalls = (diffProvider.registerContent as sinon.SinonStub).getCalls()

            // Expected content should have lines 2-4 replaced with the new code
            const expectedModifiedContent = 'line 1\nnew line 3\nline 5'
            assert.strictEqual(registerContentCalls[1].args[1], expectedModifiedContent)
        })
    })
})
