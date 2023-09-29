/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { isInBrowser } from '../common/browserUtils'

describe('isInBrowser', function () {
    it('returns false since not in browser', function () {
        assert.strictEqual(isInBrowser(), false)
    })
})
