/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { removeAnsi } from '../../../shared/utilities/textUtilities'

describe('removeAnsi', async () => {
    it('removes ansi code from text', async () => {
        assert.strictEqual(removeAnsi('\u001b[31mHello World'), 'Hello World')
    })

    it('text without ansi code remains as-is', async () => {
        const text = 'Hello World 123!'
        assert.strictEqual(removeAnsi(text), text)
    })
})
