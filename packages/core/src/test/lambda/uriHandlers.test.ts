/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { SearchParams } from '../../shared/vscode/uriHandler'
import { handleLambdaUriError, parseOpenParams } from '../../lambda/uriHandlers'
import { globals } from '../../shared'
import { ToolkitError } from '../../shared/errors'
import { CancellationError } from '../../shared/utilities/timeoutUtils'

describe('Lambda URI Handler', function () {
    describe('load-function', function () {
        it('registers for "/lambda/load-function"', function () {
            assert.throws(() => globals.uriHandler.onPath('/lambda/load-function', () => {}))
        })

        it('parses parameters', function () {
            let query = new SearchParams({
                functionName: 'example',
            })
            assert.throws(() => parseOpenParams(query), /A region must be provided/)
            query = new SearchParams({
                region: 'example',
            })
            assert.throws(() => parseOpenParams(query), /A function name must be provided/)

            const valid = {
                functionName: 'example',
                region: 'example',
                isCfn: 'false',
            }
            query = new SearchParams(valid)
            assert.deepEqual(parseOpenParams(query), valid)
        })
    })

    describe('handleLambdaUriError', function () {
        it('throws cancelled error for CancellationError', function () {
            const error = new CancellationError('user')
            assert.throws(
                () => handleLambdaUriError(error, 'test-fn', 'us-east-1'),
                (e: ToolkitError) => e.cancelled === true
            )
        })

        it('throws cancelled error for "canceled" message', function () {
            const error = new Error('Canceled') // vscode reload window
            assert.throws(
                () => handleLambdaUriError(error, 'test-fn', 'us-east-1'),
                (e: ToolkitError) => e.cancelled === true
            )
        })

        it('throws cancelled error for "cancelled" message', function () {
            const error = new Error('Timeout token cancelled')
            assert.throws(
                () => handleLambdaUriError(error, 'test-fn', 'us-east-1'),
                (e: ToolkitError) => e.cancelled === true
            )
        })

        it('throws non-cancelled error for other errors', function () {
            const error = new Error('Unable to get function')
            assert.throws(
                () => handleLambdaUriError(error, 'test-fn', 'us-east-1'),
                (e: ToolkitError) => e.cancelled !== true
            )
        })
    })
})
