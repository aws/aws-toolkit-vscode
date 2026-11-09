/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import {
    getAuthoredResourceTypes,
    getRelatedResourceTypes,
    insertRelatedResources,
} from '../../../../awsService/cloudformation/relatedResources/relatedResourcesApi'
import {
    GetAuthoredResourceTypesRequest,
    GetRelatedResourceTypesRequest,
    InsertRelatedResourcesRequest,
} from '../../../../awsService/cloudformation/relatedResources/relatedResourcesProtocol'

describe('RelatedResourcesApi', function () {
    let sandbox: sinon.SinonSandbox
    let mockClient: any

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        mockClient = {
            sendRequest: sandbox.stub(),
        }
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('getAuthoredResourceTypes', function () {
        it('should send request with template URI and return resource types', async function () {
            const templateUri = 'file:///test/template.yaml'
            const expectedTypes = ['AWS::S3::Bucket', 'AWS::Lambda::Function']

            mockClient.sendRequest.resolves(expectedTypes)

            const result = await getAuthoredResourceTypes(mockClient, templateUri)

            assert.deepStrictEqual(result, expectedTypes)
            assert.ok(mockClient.sendRequest.calledOnce)
            assert.ok(mockClient.sendRequest.calledWith(GetAuthoredResourceTypesRequest, templateUri))
        })

        it('should return empty array when no resources found', async function () {
            const templateUri = 'file:///test/empty.yaml'

            mockClient.sendRequest.resolves([])

            const result = await getAuthoredResourceTypes(mockClient, templateUri)

            assert.deepStrictEqual(result, [])
        })
    })

    describe('getRelatedResourceTypes', function () {
        it('should send request with resource type and return related types', async function () {
            const params = { parentResourceType: 'AWS::S3::Bucket' }
            const expectedTypes = ['AWS::Lambda::Function', 'AWS::IAM::Role']

            mockClient.sendRequest.resolves(expectedTypes)

            const result = await getRelatedResourceTypes(mockClient, params)

            assert.deepStrictEqual(result, expectedTypes)
            assert.ok(mockClient.sendRequest.calledOnce)
            assert.ok(mockClient.sendRequest.calledWith(GetRelatedResourceTypesRequest, params))
        })

        it('should return empty array when no related types found', async function () {
            const params = { parentResourceType: 'AWS::Custom::Resource' }

            mockClient.sendRequest.resolves([])

            const result = await getRelatedResourceTypes(mockClient, params)

            assert.deepStrictEqual(result, [])
        })
    })

    describe('insertRelatedResources', function () {
        it('should send request and return code action', async function () {
            const params = {
                templateUri: 'file:///test/template.yaml',
                relatedResourceTypes: ['AWS::Lambda::Function'],
                parentResourceType: 'AWS::S3::Bucket',
            }
            const expectedAction = {
                title: 'Insert 1 related resources',
                kind: 'refactor',
                edit: {
                    changes: {
                        'file:///test/template.yaml': [],
                    },
                },
                data: {
                    scrollToPosition: { line: 5, character: 0 },
                    firstLogicalId: 'LambdaFunctionRelatedToS3Bucket',
                },
            }

            mockClient.sendRequest.resolves(expectedAction)

            const result = await insertRelatedResources(mockClient, params)

            assert.deepStrictEqual(result, expectedAction)
            assert.ok(mockClient.sendRequest.calledOnce)
            assert.ok(mockClient.sendRequest.calledWith(InsertRelatedResourcesRequest, params))
        })

        it('should handle multiple resource types', async function () {
            const params = {
                templateUri: 'file:///test/template.yaml',
                relatedResourceTypes: ['AWS::Lambda::Function', 'AWS::IAM::Role'],
                parentResourceType: 'AWS::S3::Bucket',
            }
            const expectedAction = {
                title: 'Insert 2 related resources',
                kind: 'refactor',
                edit: {
                    changes: {
                        'file:///test/template.yaml': [],
                    },
                },
            }

            mockClient.sendRequest.resolves(expectedAction)

            const result = await insertRelatedResources(mockClient, params)

            assert.strictEqual(result.title, 'Insert 2 related resources')
        })
    })
})
