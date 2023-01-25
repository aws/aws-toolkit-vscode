/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApplicationJson, createApplicationJson, openLambdaFile } from '../../../lambda/commands/downloadLambda'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as assert from 'assert'
import { Lambda } from 'aws-sdk'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'

describe('downloadLambda', async function () {
    describe('openLambdaFile', async function () {
        it('throws if a file does not exist', async function () {
            await assert.rejects(openLambdaFile('/asdfasdfasfdasdfasdf.js'))
        })
    })

    describe('createApplicationJson', function () {
        let tempFolder: string

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

        const expectedLambdaDeploymentAppJson: ApplicationJson = {
            DeploymentMethod: 'lambda',
            Functions: {
                'lambda-func-from-lambda': {
                    PhysicalId: {
                        'us-west-2': 'lambda-func-from-lambda',
                    },
                },
            },
        }

        const expectedCloudFormationDeploymentAppJson: ApplicationJson = {
            DeploymentMethod: 'cloudformation',
            Functions: {
                HelloWorldFunction: {
                    PhysicalId: {
                        'us-west-2': 'sam-stack-HelloWorldFunction',
                    },
                },
            },
            StackName: 'sam-stack',
        }

        beforeEach(async function () {
            tempFolder = await makeTemporaryToolkitFolder()
        })
        afterEach(async function () {
            await fs.remove(tempFolder)
        })

        it('creates ApplicationJson with lambda deployment method', function () {
            createApplicationJson(lambdaDeploymentMethod, 'us-west-2', tempFolder)
            const appJsonFromFile = JSON.parse(fs.readFileSync(path.join(tempFolder, '.application.json'), 'utf8'))
            assert.deepStrictEqual(appJsonFromFile, expectedLambdaDeploymentAppJson)
        })

        it('creates ApplicationJson with cloudformation deployment method', function () {
            createApplicationJson(cfDeploymentMethod, 'us-west-2', tempFolder)
            const appJsonFromFile = JSON.parse(fs.readFileSync(path.join(tempFolder, '.application.json'), 'utf8'))
            assert.deepStrictEqual(appJsonFromFile, expectedCloudFormationDeploymentAppJson)
        })
    })
})
