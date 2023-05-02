/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { runCmd } from './testUtils'

describe('eslint', function () {
    this.timeout(180_000)

    it('passes eslint', function () {
        const result = runCmd(['./node_modules/.bin/eslint', '-c', '.eslintrc.js', '--ext', '.ts', '.'], {
            throws: false,
        })
        assert.strictEqual(result.status, 0, result.error)
    })
})
