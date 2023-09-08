/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import sinon from 'sinon'
import assert from 'assert'
import { collectFiles } from '../../weaverbird/files'
import { createTestWorkspace } from '../testUtil'

describe('collectFiles', function () {
    it('returns all files in the workspace', async function () {
        // these variables are a manual selection of settings for the test in order to test the collectFiles function
        const fileAmount = 2
        const fileNamePrefix = 'file'
        const fileContent = 'test content'

        const workspace = await createTestWorkspace(fileAmount, { fileNamePrefix, fileContent })
        sinon.stub(vscode.workspace, 'workspaceFolders').value([workspace])

        const result = await collectFiles(workspace.uri.fsPath)
        assert.strictEqual(result.length, fileAmount)
        for (let i = 0; i < fileAmount; i++) {
            assert.strictEqual(result[i].filePath.includes(fileNamePrefix), true)
            assert.strictEqual(result[i].fileContent, fileContent)
        }
    })
})
