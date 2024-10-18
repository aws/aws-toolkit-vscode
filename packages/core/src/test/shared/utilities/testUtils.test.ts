/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { createExecutableFile, createTestWorkspaceFolder, envWithNewPath, readEnv, setEnv } from '../../testUtil'
import path from 'path'
import { ChildProcess } from '../../../shared/utilities/processUtils'
import { fs } from '../../../shared'
import { isWin } from '../../../shared/vscode/env'

describe('envWithNewPath', function () {
    it('gives current path with new PATH', function () {
        const fakePath = 'fakePath'
        assert.deepStrictEqual(envWithNewPath(fakePath), { ...process.env, PATH: fakePath })
    })
})

describe('writeEnv', function () {
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
    it('creates a file that can be executes in a child process', async function () {
        const tempDir = await createTestWorkspaceFolder()
        const filePath = path.join(tempDir.uri.fsPath, `exec${isWin() ? '.cmd' : ''}`)
        await createExecutableFile(filePath, '')

        const proc = new ChildProcess(filePath)
        const result = await proc.run()
        assert.ok(result)
        assert.ok(result.exitCode === 0)

        await fs.delete(tempDir.uri, { force: true, recursive: true })
    })
})
