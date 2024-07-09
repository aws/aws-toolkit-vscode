/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import globals from '../../shared/extensionGlobals'
import fs from '../../shared/fs/fs'

describe('FileSystem', function () {
    it('getUserHomeDir()', async () => {
        // TODO: testWeb needs a `globalSetup.test.ts` ...
        await fs.init(globals.context, () => undefined)
        assert.strictEqual(fs.getUserHomeDir(), globals.context.globalStorageUri.toString())
    })

    it('getUsername()', async () => {
        // TODO: testWeb needs a `globalSetup.test.ts` ...
        await fs.init(globals.context, () => undefined)
        assert.strictEqual(fs.getUsername(), 'webuser')
    })
})
