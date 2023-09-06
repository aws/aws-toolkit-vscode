/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { buildDefaultApiInvokeUrl } from '../../../apigateway/commands/copyUrl'

describe('buildDefaultApiInvokeUrl', function () {
    it('builds a url', async function () {
        const expected = 'https://1234567ab.execute-api.us-east-1.amazonaws.com/stagename'

        assert.deepStrictEqual(
            buildDefaultApiInvokeUrl('1234567ab', 'us-east-1', 'amazonaws.com', 'stagename'),
            expected
        )
    })
})
