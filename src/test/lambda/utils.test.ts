/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { getLambdaDetailsFromConfiguration } from '../../lambda/utils'
import { assertThrowsError } from '../shared/utilities/assertUtils'

describe('lambda utils', async () => {
    describe('getLambdaDetailsFromConfiguration', () => {
        it('returns valid filenames and function names', () => {
            const jsNonNestedParsedName = getLambdaDetailsFromConfiguration({
                Runtime: 'nodejs12.x',
                Handler: 'app.lambda_handler',
            })
            const pyNonNestedParsedName = getLambdaDetailsFromConfiguration({
                Runtime: 'python3.8',
                Handler: 'app.lambda_handler',
            })
            const jsNestedParsedName = getLambdaDetailsFromConfiguration({
                Runtime: 'nodejs12.x',
                Handler: 'asdf/jkl/app.lambda_handler',
            })
            const PyNestedParsedName = getLambdaDetailsFromConfiguration({
                Runtime: 'python3.8',
                Handler: 'asdf/jkl/app.lambda_handler',
            })
            assert(jsNonNestedParsedName.fileName, 'app.js')
            assert(pyNonNestedParsedName.fileName, 'app.py')
            assert(jsNestedParsedName.fileName, 'asdf/jkl/app.js')
            assert(PyNestedParsedName.fileName, 'asdf/jkl/app.py')
            assert(jsNonNestedParsedName.functionName, 'lambda_handler')
            assert(pyNonNestedParsedName.functionName, 'lambda_handler')
            assert(jsNestedParsedName.functionName, 'lambda_handler')
            assert(PyNestedParsedName.functionName, 'lambda_handler')
        })

        it('throws if the handler is not a supported runtime', async () => {
            // unsupported runtime for import
            await assertThrowsError(async () =>
                getLambdaDetailsFromConfiguration({
                    Runtime: 'dotnetcore3.1',
                    Handler: 'HelloWorld::HelloWorld.Function::FunctionHandler',
                })
            )
            // runtime that isn't present, period
            await assertThrowsError(async () =>
                getLambdaDetailsFromConfiguration({ Runtime: 'COBOL-60', Handler: 'asdf.asdf' })
            )
        })
    })
})
