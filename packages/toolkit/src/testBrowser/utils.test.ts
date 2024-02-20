/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { isInBrowser } from '../common/browserUtils'

describe('isInBrowser', function () {
    it('returns true when in browser', function () {
        // Note that this only works since the state is indirectly stored in `globalThis`, see browser.md for more info
        assert.strictEqual(isInBrowser(), true)
    })
})
