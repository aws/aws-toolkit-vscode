/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { once } from '../../../shared/utilities/functionUtils'

describe('once', function () {
    it('does not execute sync functions returning void more than once', function () {
        let counter = 0
        const fn = once(() => void counter++)

        fn()
        assert.strictEqual(counter, 1)

        fn()
        assert.strictEqual(counter, 1)
    })
})
