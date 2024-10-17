/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { createTestWorkspaceFolder, readEnvPath, withEnvPath } from '../../testUtil'

describe('withEnvPath', function () {
    it('resets path when error in task', async function () {
        const originalPath = readEnvPath()
        const tempFolder = await createTestWorkspaceFolder()
        try {
            await withEnvPath(tempFolder.uri.fsPath, async () => {
                throw new Error()
            })
        } catch {}
        assert.strictEqual(readEnvPath(), originalPath)
    })

    it('changes $PATH temporarily', async function () {
        const originalPath = readEnvPath()
        const tempFolder = await createTestWorkspaceFolder()
        await withEnvPath(tempFolder.uri.fsPath, async () => {
            assert.strictEqual(readEnvPath(), tempFolder.uri.fsPath)
        })
        assert.strictEqual(readEnvPath(), originalPath)
    })
})
