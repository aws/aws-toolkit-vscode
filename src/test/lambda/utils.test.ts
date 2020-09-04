/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { getLambdaFileNameFromHandler } from '../../lambda/utils'
import { assertThrowsError } from '../shared/utilities/assertUtils'

describe('lambda utils', async () => {
    describe('getLambdaFileNameFromHandler', () => {
        it('returns valid filenames', () => {
            assert(getLambdaFileNameFromHandler({ Runtime: 'nodejs12.x', Handler: 'app.lambda_handler' }), 'app.js')
            assert(getLambdaFileNameFromHandler({ Runtime: 'python3.8', Handler: 'app.lambda_handler' }), 'app.py')
            assert(
                getLambdaFileNameFromHandler({ Runtime: 'nodejs12.x', Handler: 'asdf/jkl/app.lambda_handler' }),
                'asdf/jkl/app.js'
            )
            assert(
                getLambdaFileNameFromHandler({ Runtime: 'python3.8', Handler: 'asdf/jkl/app.lambda_handler' }),
                'asdf/jkl/app.py'
            )
        })

        it('throws if the handler is not a supported runtime', async () => {
            // unsupported runtime for import
            await assertThrowsError(async () =>
                getLambdaFileNameFromHandler({
                    Runtime: 'dotnetcore3.1',
                    Handler: 'HelloWorld::HelloWorld.Function::FunctionHandler',
                })
            )
            // runtime that isn't present, period
            await assertThrowsError(async () =>
                getLambdaFileNameFromHandler({ Runtime: 'COBOL-60', Handler: 'asdf.asdf' })
            )
        })
    })
})
