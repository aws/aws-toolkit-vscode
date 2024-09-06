/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { isWeb } from '../shared/extensionGlobals'

describe('isWeb', function () {
    it('returns false since not in browser', function () {
        assert.strictEqual(isWeb(), false)
    })
})
