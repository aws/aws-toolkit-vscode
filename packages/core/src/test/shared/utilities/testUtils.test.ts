/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { createExecutableFile, createTestWorkspaceFolder, copyEnv } from '../../testUtil'
import path from 'path'
import { fs } from '../../../shared'
import { isWin } from '../../../shared/vscode/env'
import { tryRun } from '../../../shared/utilities/pathFind'

describe('copyEnv', function () {
    it('modifies the node environment variables (Non-Windows)', function () {
        // PATH returns undefined on Windows.
        if (isWin()) {
            this.skip()
        }

        const originalPath = copyEnv().PATH
        const fakePath = 'fakePath'
        process.env.PATH = fakePath
        assert.strictEqual(copyEnv().PATH, fakePath)

        process.env.PATH = originalPath
        assert.strictEqual(copyEnv().PATH, originalPath)
    })
})

describe('createExecutableFile', function () {
    it('creates a file that can be executed', async function () {
        const tempDir = await createTestWorkspaceFolder()
        const filePath = path.join(tempDir.uri.fsPath, `exec${isWin() ? '.cmd' : ''}`)
        await createExecutableFile(filePath, '')

        const result = await tryRun(filePath, [], 'yes')
        assert.ok(result)
        await fs.delete(tempDir.uri, { force: true, recursive: true })
    })
})
