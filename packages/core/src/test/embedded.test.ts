/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { isEmbedded } from '../shared/extensionGlobals'

describe('isEmbedded', function () {
    it('returns false since not in browser embedded context support postMessage', function () {
        assert.strictEqual(isEmbedded(), false)
    })
})
