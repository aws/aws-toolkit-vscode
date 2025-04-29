/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { isValidResponseError } from '../../../../../src/lsp/chat/error'
import { ResponseError } from '@aws/language-server-runtimes/protocol'
import * as assert from 'assert'

describe('isValidResponseError', async function () {
    it('requires the data field', function () {
        assert.ok(isValidResponseError(new ResponseError(0, 'this one has data', {})))
        assert.ok(!isValidResponseError(new ResponseError(0, 'this one does not have data')))
    })
})
