/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import globals from '../../shared/extensionGlobals'
import fs from '../../shared/fs/fs'

describe('FileSystem', function () {
    it('getHomeDirectory() when in Browser', async () => {
        // TODO: testWeb needs a `globalSetup.test.ts` ...
        await fs.initUserHomeDir(globals.context, () => undefined)
        assert.strictEqual(fs.getUserHomeDir(), globals.context.globalStorageUri.toString())
    })
})
