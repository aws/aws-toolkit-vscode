/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import globals from '../shared/extensionGlobals'

describe('activation', async () => {
    it('defines a region provider that can provide regions when in web mode', async () => {
        assert(globals.regionProvider.getRegions().length > 0)
    })
})
