/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { fromQueryToParameters } from '../../../shared/utilities/uriUtils'

describe('uriUtils', function () {
    it('returns empty when no query parameters are present', function () {
        const params = fromQueryToParameters('')
        assert.deepStrictEqual(params, new Map())
    })

    it('returns parameters', function () {
        const params = fromQueryToParameters('param1=value')
        assert.deepStrictEqual(params, new Map([['param1', 'value']]))
    })

    it('returns latest parameters when overlapped', function () {
        const params = fromQueryToParameters('param1=value&param1=value2')
        assert.deepStrictEqual(params, new Map([['param1', 'value2']]))
    })

    it('returns all parameters', function () {
        const params = fromQueryToParameters('param1=value&param2=value2&param3=value3')
        assert.deepStrictEqual(
            params,
            new Map([
                ['param1', 'value'],
                ['param2', 'value2'],
                ['param3', 'value3'],
            ])
        )
    })
})
