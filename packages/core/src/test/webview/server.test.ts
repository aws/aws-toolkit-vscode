/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SinonStub, stub } from 'sinon'
import { Logger, setLogger } from '../../shared/logger/logger'
import assert from 'assert'
import { ToolkitError } from '../../shared/errors'
import { handleWebviewError } from '../../webviews/server'

describe('logAndShowWebviewError()', function () {
    let logError: SinonStub<[message: string, ...meta: any[]], number>
    const myWebviewId = 'myWebviewId'
    const myCommand = 'myCommand'

    beforeEach(function () {
        logError = stub()
        const logger = { error: logError } as unknown as Logger
        setLogger(logger, 'main')
    })

    afterEach(function () {
        setLogger(undefined, 'main')
    })

    it('logs the provided error, but is wrapped in ToolkitErrors for more context', function () {
        // The method is being tested due to its fragile implementation. This test
        // protects against changes in the underlying logAndShowError() implementation.

        const inputError = new Error('Random Error')

        handleWebviewError(inputError, myWebviewId, myCommand)

        assert.strictEqual(logError.callCount, 1)

        // A shortened error is shown to the user
        const userFacingError = logError.getCall(0).args[1]
        assert(userFacingError instanceof ToolkitError)
        assert.strictEqual(userFacingError.message, 'Webview error')

        // A higher level context of what caused the error
        const detailedError = userFacingError.cause
        assert(detailedError instanceof ToolkitError)
        assert.strictEqual(detailedError.message, `Webview backend command failed: "${myCommand}()"`)

        // The actual error
        const rootError = detailedError.cause
        assert(rootError instanceof Error)
        assert.strictEqual(rootError, inputError)
    })
})
