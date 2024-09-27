/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { isNewOsSession } from '../../../shared/utilities/osUtils'
import { fs } from '../../../shared'
import { isWin } from '../../../shared/vscode/env'
import { TestFolder } from '../../testUtil'

describe('isNewOsSession', () => {
    if (!isWin()) {
        it('unix-like: returns true when expected', async () => {
            const tmpDir = (await TestFolder.create()).path

            // On a new session the first caller will get true
            assert.strictEqual(await isNewOsSession(tmpDir), true)
            // Subsequent callers will get false
            assert.strictEqual(await isNewOsSession(tmpDir), false)

            // Mimic a fresh restart (/tmp/ folder is deleted)
            const files = await fs.readdir(tmpDir)
            await Promise.all(files.map(async (file) => await fs.delete(`${tmpDir}/${file[0]}`)))

            // Since the tmp/ folder was cleared it is considered a new session
            assert.strictEqual(await isNewOsSession(tmpDir), true)
            assert.strictEqual(await isNewOsSession(tmpDir), false)
        })
    }
})
