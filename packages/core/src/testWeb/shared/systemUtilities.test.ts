/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { SystemUtilities } from '../../shared/systemUtilities'
import globals from '../../shared/extensionGlobals'
import fs from '../../shared/fs/fs'

describe('SystemUtilities', function () {
    it('getHomeDirectory() when in Browser', async () => {
        // TODO: testWeb needs a `globalSetup.test.ts` ...
        await fs.initUserHomeDir(globals.context, () => undefined)
        assert.strictEqual(SystemUtilities.getHomeDirectory(), globals.context.globalStorageUri.toString())
    })
})
