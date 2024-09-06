/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { isWeb } from '../shared/extensionGlobals'

describe('isWeb', function () {
    it('returns true when in web mode', function () {
        // Note that this only works since the state is indirectly stored in `globalThis`, see web.md for more info
        assert.strictEqual(isWeb(), true)
    })
})
