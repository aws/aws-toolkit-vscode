/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as path from 'path'
import { getRuntimeForLambda } from '../../../shared/codelens/localLambdaRunner'
import { assertRejects } from '../utilities/assertUtils'

describe('localLambdaRunner', () => {
    describe('getRuntimeForLambda', () => {
        const testData = [
            {
                title: 'existing lambda, single runtime',
                handlerName: 'app.lambda_handler',
                templateFileName: 'template_python2.7.yaml',
                expectedRuntime: 'python2.7'
            },
            {
                title: 'non-existing lambda, single runtime',
                handlerName: 'app.handler_that_does_not_exist',
                templateFileName: 'template_python2.7.yaml',
                expectedRuntime: 'python2.7'
            },
            {
                title: '2nd existing lambda, multiple runtimes',
                handlerName: 'app.lambda_handler2',
                templateFileName: 'template_python_mixed.yaml',
                expectedRuntime: 'python2.7'
            },
            {
                title: '1st existing lambda, multiple runtimes',
                handlerName: 'app.lambda_handler3',
                templateFileName: 'template_python_mixed.yaml',
                expectedRuntime: 'python3.6'
            },
            {
                title: 'non-existing lambda, multiple runtimes',
                handlerName: 'app.handler_that_does_not_exist',
                templateFileName: 'template_python_mixed.yaml',
                expectedRuntime: undefined
            },
        ]
        for (const data of testData) {
            it(`should ${data.expectedRuntime ? 'resolve runtime' : 'throw'} for ${data.title}`, async () => {
                const templatePath = path.join(path.dirname(__filename), data.templateFileName)
                const expectedRuntime = data.expectedRuntime
                if (data.expectedRuntime === undefined) {
                    assertRejects(async () => {
                        getRuntimeForLambda({
                            templatePath,
                            handlerName: data.handlerName
                        })
                    })
                } else {
                    const runtime = await getRuntimeForLambda({
                        templatePath,
                        handlerName: data.handlerName
                    })
                    assert(
                        expectedRuntime === runtime,
                        JSON.stringify({expectedRuntime, runtime})
                    )
                }
            })
        }
    })
})
