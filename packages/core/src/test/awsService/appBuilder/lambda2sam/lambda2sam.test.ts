/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import assert from 'assert'
import { LambdaFunctionNode } from '../../../../lambda/explorer/lambdaFunctionNode'
import { DefaultLambdaClient } from '../../../../shared/clients/lambdaClient'
import { Template } from '../../../../shared/cloudformation/cloudformation'
import * as lambda2sam from '../../../../awsService/appBuilder/lambda2sam/lambda2sam'
import * as authUtils from '../../../../auth/utils'
import * as utils from '../../../../awsService/appBuilder/utils'

describe('lambda2sam', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('ifSamTemplate', function () {
        it('returns true when transform is a string and starts with AWS::Serverless', function () {
            const template: Template = {
                Transform: 'AWS::Serverless-2016-10-31',
            }
            assert.strictEqual(lambda2sam.ifSamTemplate(template), true)
        })

        it('returns false when transform is a string and does not start with AWS::Serverless', function () {
            const template: Template = {
                Transform: 'AWS::Other-Transform',
            }
            assert.strictEqual(lambda2sam.ifSamTemplate(template), false)
        })

        it('returns true when transform is an array and at least one starts with AWS::Serverless', function () {
            const template: Template = {
                Transform: ['AWS::Serverless-2016-10-31', 'AWS::Other-Transform'] as any,
            }
            assert.strictEqual(lambda2sam.ifSamTemplate(template), true)
        })

        it('returns false when transform is an array and none start with AWS::Serverless', function () {
            const template: Template = {
                Transform: ['AWS::Other-Transform-1', 'AWS::Other-Transform-2'] as any,
            }
            assert.strictEqual(lambda2sam.ifSamTemplate(template), false)
        })

        it('returns false when transform is not present', function () {
            const template: Template = {}
            assert.strictEqual(lambda2sam.ifSamTemplate(template), false)
        })

        it('returns false when transform is an unsupported type', function () {
            const template: Template = {
                Transform: { some: 'object' } as any,
            }
            assert.strictEqual(lambda2sam.ifSamTemplate(template), false)
        })
    })

    describe('extractLogicalIdFromIntrinsic', function () {
        it('extracts logical ID from Ref intrinsic', function () {
            const value = { Ref: 'MyResource' }
            assert.strictEqual(lambda2sam.extractLogicalIdFromIntrinsic(value), 'MyResource')
        })

        it('extracts logical ID from GetAtt intrinsic with Arn attribute', function () {
            const value = { 'Fn::GetAtt': ['MyResource', 'Arn'] }
            assert.strictEqual(lambda2sam.extractLogicalIdFromIntrinsic(value), 'MyResource')
        })

        it('returns undefined for GetAtt intrinsic with non-Arn attribute', function () {
            const value = { 'Fn::GetAtt': ['MyResource', 'Name'] }
            assert.strictEqual(lambda2sam.extractLogicalIdFromIntrinsic(value), undefined)
        })

        it('returns undefined for non-intrinsic values', function () {
            assert.strictEqual(lambda2sam.extractLogicalIdFromIntrinsic('not-an-intrinsic'), undefined)
            assert.strictEqual(lambda2sam.extractLogicalIdFromIntrinsic({ NotIntrinsic: 'value' }), undefined)
            assert.strictEqual(lambda2sam.extractLogicalIdFromIntrinsic(undefined), undefined)
        })
    })

    describe('callExternalApiForCfnTemplate', function () {
        let lambdaClientStub: sinon.SinonStubbedInstance<DefaultLambdaClient>
        let cfnClientStub: any

        beforeEach(function () {
            lambdaClientStub = sandbox.createStubInstance(DefaultLambdaClient)
            // Stub at prototype level to avoid TypeScript errors
            sandbox
                .stub(DefaultLambdaClient.prototype, 'getFunction')
                .callsFake((name) => lambdaClientStub.getFunction(name))

            // Mock CloudFormation client for the new external API calls - now returns Promises directly
            cfnClientStub = {
                getGeneratedTemplate: sandbox.stub().resolves({
                    Status: 'COMPLETE',
                    TemplateBody: JSON.stringify({
                        AWSTemplateFormatVersion: '2010-09-09',
                        Resources: {
                            testFunc: {
                                DeletionPolicy: 'Retain',
                                Properties: {
                                    Code: {
                                        S3Bucket: 'aws-sam-cli-managed-default-samclisourcebucket-1n8tvb0jdhsd',
                                        S3Key: '1d1c93ec17af7e2666ee20ea1a215c77',
                                    },
                                    Environment: {
                                        Variables: {
                                            KEY: 'value',
                                        },
                                    },
                                    FunctionName: 'myFunction',
                                    Handler: 'index.handler',
                                    MemorySize: 128,
                                    PackageType: 'Zip',
                                    Role: 'arn:aws:iam::123456789012:role/lambda-role',
                                    Runtime: 'nodejs18.x',
                                    Timeout: 3,
                                },
                                Type: 'AWS::Lambda::Function',
                            },
                        },
                    }),
                }),
                describeGeneratedTemplate: sandbox.stub().resolves({
                    Status: 'COMPLETE',
                    Resources: [
                        {
                            LogicalResourceId: 'testFunc',
                            ResourceType: 'AWS::Lambda::Function',
                            ResourceIdentifier: {
                                FunctionName: 'myFunction',
                            },
                        },
                    ],
                }),
            }
            sandbox.stub(utils, 'getCFNClient').resolves(cfnClientStub)

            // Mock IAM connection
            const mockConnection = {
                type: 'iam' as const,
                id: 'test-connection',
                label: 'Test Connection',
                state: 'valid' as const,
                getCredentials: sandbox.stub().resolves({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                }),
            }
            sandbox.stub(authUtils, 'getIAMConnection').resolves(mockConnection)

            // Mock fetch response
            sandbox.stub(global, 'fetch').resolves({
                ok: true,
                json: sandbox.stub().resolves({
                    cloudFormationTemplateId: 'test-template-id',
                }),
            } as any)
        })

        it('creates a basic CloudFormation template for the Lambda function', async function () {
            const lambdaNode = {
                name: 'myFunction',
                regionCode: 'us-east-2',
                arn: 'arn:aws:lambda:us-east-2:123456789012:function:myFunction',
            } as LambdaFunctionNode

            lambdaClientStub.getFunction.resolves({
                Configuration: {
                    FunctionName: 'myFunction',
                    Handler: 'index.handler',
                    Role: 'arn:aws:iam::123456789012:role/lambda-role',
                    Runtime: 'nodejs18.x',
                    Timeout: 3,
                    MemorySize: 128,
                    Environment: { Variables: { KEY: 'value' } },
                },
            })

            // Create a simple mock template that matches the Template type
            const mockTemplate = {
                AWSTemplateFormatVersion: '2010-09-09',
                Resources: {
                    testFunc: {
                        DeletionPolicy: 'Retain',
                        Properties: {
                            Code: {
                                S3Bucket: 'aws-sam-cli-managed-default-samclisourcebucket-1n8tvb0jdhsd',
                                S3Key: '1d1c93ec17af7e2666ee20ea1a215c77',
                            },
                            Environment: {
                                Variables: {
                                    KEY: 'value',
                                },
                            },
                            FunctionName: 'myFunction',
                            Handler: 'index.handler',
                            MemorySize: 128,
                            PackageType: 'Zip',
                            Role: 'arn:aws:iam::123456789012:role/lambda-role',
                            Runtime: 'nodejs18.x',
                            Timeout: 3,
                        },
                        Type: 'AWS::Lambda::Function',
                    },
                },
            }
            const mockList = [
                {
                    LogicalResourceId: 'testFunc',
                    ResourceIdentifier: {
                        FunctionName: 'myFunction',
                    },
                    ResourceType: 'AWS::Lambda::Function',
                },
            ]

            const result = await lambda2sam.callExternalApiForCfnTemplate(lambdaNode)
            // Verify the result structure matches expected format
            assert.strictEqual(Array.isArray(result), true)
            assert.strictEqual(result.length, 2)
            const [template, resourcesToImport] = result
            assert.strictEqual(typeof template, 'object')
            assert.strictEqual(Array.isArray(resourcesToImport), true)
            assert.strictEqual(resourcesToImport.length, 1)
            assert.strictEqual(resourcesToImport[0].ResourceType, 'AWS::Lambda::Function')
            assert.strictEqual(resourcesToImport[0].LogicalResourceId, 'testFunc')
            assert.deepStrictEqual(result, [mockTemplate, mockList])
        })
    })

    describe('determineStackAssociation', function () {
        let lambdaClientStub: sinon.SinonStubbedInstance<DefaultLambdaClient>

        beforeEach(function () {
            lambdaClientStub = sandbox.createStubInstance(DefaultLambdaClient)
            sandbox
                .stub(DefaultLambdaClient.prototype, 'getFunction')
                .callsFake((name) => lambdaClientStub.getFunction(name))
        })

        it('returns undefined when Lambda has no tags', async function () {
            const lambdaNode = {
                name: 'myFunction',
                regionCode: 'us-west-2',
            } as LambdaFunctionNode

            lambdaClientStub.getFunction.resolves({})

            // Skip CloudFormation mocking for now
            // This is difficult to mock correctly without errors and would be better tested with integration tests

            const result = await lambda2sam.determineStackAssociation(lambdaNode)

            assert.strictEqual(result, undefined)
            assert.strictEqual(lambdaClientStub.getFunction.calledOnceWith(lambdaNode.name), true)
        })

        // For this function, additional testing would require complex mocking of the AWS SDK
        // Consider adding more specific test cases in an integration test
    })
})
