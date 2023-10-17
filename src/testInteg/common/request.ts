/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { endpointsFileUrl } from '../../shared/constants'
import fetch from '../../common/request'
import assert from 'assert'

describe('fetch()', function () {
    it('makes a fetch request', async function () {
        const response = await fetch('GET', endpointsFileUrl).response
        assert.strictEqual(response.ok, true)
        assert.strictEqual(response.status, 200)
    })
})
