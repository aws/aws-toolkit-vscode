/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { createExecutableFile, createTestWorkspaceFolder, envWithNewPath, readEnv, setEnv } from '../../testUtil'
import path from 'path'
import { fs } from '../../../shared'
import { isWin } from '../../../shared/vscode/env'
import { tryRun } from '../../../shared/utilities/pathFind'

describe('envWithNewPath', function () {
    it('gives current path with new PATH', function () {
        const fakePath = 'fakePath'
        assert.deepStrictEqual(envWithNewPath(fakePath), { ...process.env, PATH: fakePath })
    })
})

describe('setEnv', function () {
    it('modifies the node environment variables', function () {
        const originalEnv = readEnv()
        const fakePath = 'fakePath'
        setEnv(envWithNewPath('fakePath'))
        assert.strictEqual(readEnv().PATH, fakePath)

        setEnv(originalEnv)
        assert.deepStrictEqual(readEnv(), originalEnv)
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
