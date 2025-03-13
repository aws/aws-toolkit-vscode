/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { withPerfLogOnFail } from '../../../shared/logger/perfLogger'
import { assertLogsContain } from '../../globalSetup.test'
import { ToolkitError } from '../../../shared'

describe('withPerfLogOnFail', function () {
    it('only logs when function throws an error', function () {
        const happyFunction = withPerfLogOnFail('happyFunction', () => 5)
        const errorFunction = withPerfLogOnFail('errorFunction', () => {
            throw new Error('error')
        })
        assert.ok(happyFunction() === 5)
        assert.throws(() => assertLogsContain('happyFunction', false, 'error'))

        assert.throws(() => errorFunction())
        assertLogsContain('errorFunction', false, 'error')
    })

    it('wraps underlying error in a ToolkitError', function () {
        const errorFunction = withPerfLogOnFail('errorFunction', () => {
            throw new Error('error')
        })
        assert.throws(() => errorFunction(), ToolkitError)
    })

    it('accepts custom error code mappings', function () {
        const errorFunction = withPerfLogOnFail(
            'errorFunction',
            () => {
                throw new Error('error')
            },
            {},
            (e) => e.message.slice(0, 3)
        )
        try {
            errorFunction()
            assert.fail('should have thrown')
        } catch (e) {
            if (!(e instanceof ToolkitError)) {
                assert.fail('should have thrown a ToolkitError')
            }
            assert.equal(e.code, 'err')
        }
    })
})
