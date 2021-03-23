/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { getStringHash, removeAnsi } from '../../../shared/utilities/textUtilities'

describe('removeAnsi', async function () {
    it('removes ansi code from text', async function () {
        assert.strictEqual(removeAnsi('\u001b[31mHello World'), 'Hello World')
    })

    it('text without ansi code remains as-is', async function () {
        const text = 'Hello World 123!'
        assert.strictEqual(removeAnsi(text), text)
    })
})

describe('getStringHash', async function () {
    it('produces a hash', async function () {
        assert.ok(getStringHash('hello'))
    })

    it('produces a different hash for different strings', async function () {
        assert.notStrictEqual(getStringHash('hello'), getStringHash('hello '))
    })
})
