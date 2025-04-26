/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { sanitizeLogLevel } from '../../../../../src/lsp/config'

describe('sanitizeLogLevel', function () {
    it('should return the log level if it is valid', function () {
        const logLevel = 'info'
        const sanitizedLogLevel = sanitizeLogLevel(logLevel)
        assert.strictEqual(sanitizedLogLevel, logLevel)
    })

    it('should default to info if it is invalid', function () {
        const logLevel = 'verbose'
        const sanitizedLogLevel = sanitizeLogLevel(logLevel)
        assert.strictEqual(sanitizedLogLevel, 'info')
    })
})
