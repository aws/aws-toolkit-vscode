/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { ToolkitError } from '../../shared/errors'
import { handleWebviewError } from '../../webviews/server'
import { assertLogsContain } from '../globalSetup.test'

describe('logAndShowWebviewError()', function () {
    const myWebviewId = 'myWebviewId'
    const myCommand = 'myCommand'

    beforeEach(function () {})

    afterEach(function () {})

    it('logs the provided error, but is wrapped in ToolkitErrors for more context', function () {
        // The method is being tested due to its fragile implementation. This test
        // protects against changes in the underlying logAndShowError() implementation.

        const inputError = new Error('Random Error')

        const err = handleWebviewError(inputError, myWebviewId, myCommand)

        // assertLogsContain('Random Error', false, 'error')

        // A shortened error is shown to the user
        assertLogsContain('Webview error', false, 'error')

        // A higher level context of what caused the error
        const detailedError = err.cause
        assert(detailedError instanceof ToolkitError)
        assert.strictEqual(detailedError.message, `Webview backend command failed: "${myCommand}()"`)

        // The actual error
        const rootError = detailedError.cause
        assert(rootError instanceof Error)
        assert.strictEqual(rootError, inputError)
    })
})
