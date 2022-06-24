/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createApplicationJson, openLambdaFile } from '../../../lambda/commands/downloadLambda'
import * as assert from 'assert'
import { Lambda } from 'aws-sdk'

describe('downloadLambda', async function () {
    describe('openLambdaFile', async function () {
        it('throws if a file does not exist', async function () {
            await assert.rejects(openLambdaFile('/asdfasdfasfdasdfasdf.js'))
        })
    })

    describe('createApplicationJson', function () {
        const lambdaDeploymentMethod: Lambda.GetFunctionResponse = {
            Configuration: {
                FunctionName: 'lambda-func-from-lambda',
            },
        }

        const cfDeploymentMethod: Lambda.GetFunctionResponse = {
            Configuration: {
                FunctionName: 'sam-stack-HelloWorldFunction',
            },
            Tags: {
                'aws:cloudformation:stack-name': 'sam-stack',
                'aws:cloudformation:logical-id': 'HelloWorldFunction',
            },
        }

        it('creates ApplicationJson with lambda deployment method', function () {
            const appJson = createApplicationJson(lambdaDeploymentMethod, 'region')
            assert.strictEqual(appJson.DeploymentMethod, 'lambda', 'wrong deployment method')
            const logicalId = Object.keys(appJson.Functions)[0]
            assert.strictEqual(logicalId, 'lambda-func-from-lambda', 'wrong logicalId')
            const physicalId = appJson.Functions['lambda-func-from-lambda'].PhysicalId['region']
            assert.strictEqual(physicalId, 'lambda-func-from-lambda', 'wrong physicalId')
        })

        it('creates ApplicationJson with cloudformation deployment method', function () {
            const appJson = createApplicationJson(cfDeploymentMethod, 'region')
            assert.strictEqual(appJson.DeploymentMethod, 'cloudformation', 'wrong deployment method')
            const logicalId = Object.keys(appJson.Functions)[0]
            assert.strictEqual(logicalId, 'HelloWorldFunction', 'wrong logicalId')
            const physicalId = appJson.Functions['HelloWorldFunction'].PhysicalId['region']
            assert.strictEqual(physicalId, 'sam-stack-HelloWorldFunction', 'wrong physicalId')
        })
    })
})
