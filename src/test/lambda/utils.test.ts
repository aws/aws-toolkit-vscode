/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { getLambdaDetails } from '../../lambda/utils'

describe('lambda utils', async function () {
    describe('getLambdaDetails', function () {
        it('returns valid filenames and function names', function () {
            const jsNonNestedParsedName = getLambdaDetails({
                Runtime: 'nodejs16.x',
                Handler: 'app.lambda_handler',
            })
            const pyNonNestedParsedName = getLambdaDetails({
                Runtime: 'python3.8',
                Handler: 'app.lambda_handler',
            })
            const jsNestedParsedName = getLambdaDetails({
                Runtime: 'nodejs16.x',
                Handler: 'asdf/jkl/app.lambda_handler',
            })
            const node18ModuleParsedName = getLambdaDetails({
                Runtime: 'nodejs18.x',
                Handler: 'asdf/jkl/app.lambda_handler',
            })
            const PyNestedParsedName = getLambdaDetails({
                Runtime: 'python3.8',
                Handler: 'asdf/jkl/app.lambda_handler',
            })
            assert.strictEqual(jsNonNestedParsedName.fileName, 'app.js')
            assert.strictEqual(pyNonNestedParsedName.fileName, 'app.py')
            assert.strictEqual(jsNestedParsedName.fileName, 'asdf/jkl/app.js')
            assert.strictEqual(node18ModuleParsedName.fileName, 'asdf/jkl/app.mjs')
            assert.strictEqual(PyNestedParsedName.fileName, 'asdf/jkl/app.py')
            assert.strictEqual(jsNonNestedParsedName.functionName, 'lambda_handler')
            assert.strictEqual(pyNonNestedParsedName.functionName, 'lambda_handler')
            assert.strictEqual(jsNestedParsedName.functionName, 'lambda_handler')
            assert.strictEqual(PyNestedParsedName.functionName, 'lambda_handler')
        })

        it('throws if the handler is not a supported runtime', async function () {
            // unsupported runtime for import
            assert.throws(() =>
                getLambdaDetails({
                    Runtime: 'dotnetcore3.1',
                    Handler: 'HelloWorld::HelloWorld.Function::FunctionHandler',
                })
            )
            // runtime that isn't present, period
            assert.throws(() => getLambdaDetails({ Runtime: 'COBOL-60', Handler: 'asdf.asdf' }))
        })
    })
})
