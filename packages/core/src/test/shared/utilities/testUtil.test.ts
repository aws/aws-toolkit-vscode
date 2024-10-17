/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { createTestWorkspaceFolder, envWithNewPath, readEnv, withEnv } from '../../testUtil'

describe('withEnv', function () {
    it('resets path when error in task', async function () {
        const originalEnv = readEnv()
        const tempFolder = await createTestWorkspaceFolder()
        try {
            await withEnv(envWithNewPath(tempFolder.uri.fsPath), async () => {
                throw new Error()
            })
        } catch {}
        assert.strictEqual(readEnv().PATH, originalEnv.PATH)
    })

    it('changes $PATH temporarily', async function () {
        const originalEnv = readEnv()
        const tempFolder = await createTestWorkspaceFolder()
        await withEnv(envWithNewPath(tempFolder.uri.fsPath), async () => {
            assert.strictEqual(readEnv().PATH, tempFolder.uri.fsPath)
        })
        assert.strictEqual(readEnv().PATH, originalEnv.PATH)
    })
})
