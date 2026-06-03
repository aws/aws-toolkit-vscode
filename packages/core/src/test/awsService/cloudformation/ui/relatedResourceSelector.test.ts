/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { ResponseError } from 'vscode-languageclient/node'
import { ErrorCodes } from 'vscode-jsonrpc'
import { RelatedResourceSelector } from '../../../../awsService/cloudformation/ui/relatedResourceSelector'
import * as relatedResourcesApi from '../../../../awsService/cloudformation/relatedResources/relatedResourcesApi'

describe('RelatedResourceSelector', function () {
    let sandbox: sinon.SinonSandbox
    let mockClient: any
    let selector: RelatedResourceSelector
    let showQuickPickStub: sinon.SinonStub
    let showInformationMessageStub: sinon.SinonStub
    let getAuthoredResourceTypesV2Stub: sinon.SinonStub
    let getAuthoredResourceTypesStub: sinon.SinonStub

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        mockClient = {}
        selector = new RelatedResourceSelector(mockClient)

        showQuickPickStub = sandbox.stub(vscode.window, 'showQuickPick')
        showInformationMessageStub = sandbox.stub(vscode.window, 'showInformationMessage')
        getAuthoredResourceTypesV2Stub = sandbox.stub(relatedResourcesApi, 'getAuthoredResourceTypesV2')
        getAuthoredResourceTypesStub = sandbox.stub(relatedResourcesApi, 'getAuthoredResourceTypes')
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('selectAuthoredResourceType', function () {
        it('should return undefined and show message when no resources found', async function () {
            getAuthoredResourceTypesV2Stub.resolves([])

            const result = await selector.selectAuthoredResourceType('file:///test.yaml')

            assert.strictEqual(result, undefined)
            assert.ok(showInformationMessageStub.calledWith('No resources found in the current template'))
        })

        it('should return selected resource when single resource of type exists', async function () {
            getAuthoredResourceTypesV2Stub.resolves([
                { logicalId: 'MyBucket', type: 'AWS::S3::Bucket' },
                { logicalId: 'MyFunction', type: 'AWS::Lambda::Function' },
            ])
            showQuickPickStub.resolves('AWS::S3::Bucket')

            const result = await selector.selectAuthoredResourceType('file:///test.yaml')

            assert.deepStrictEqual(result, { logicalId: 'MyBucket', type: 'AWS::S3::Bucket' })
            assert.ok(showQuickPickStub.calledOnce)
        })

        it('should show logical ID picker when multiple resources of same type exist', async function () {
            getAuthoredResourceTypesV2Stub.resolves([
                { logicalId: 'Bucket1', type: 'AWS::S3::Bucket' },
                { logicalId: 'Bucket2', type: 'AWS::S3::Bucket' },
            ])
            showQuickPickStub.onFirstCall().resolves('AWS::S3::Bucket')
            showQuickPickStub.onSecondCall().resolves({ label: 'Bucket2', logicalId: 'Bucket2' })

            const result = await selector.selectAuthoredResourceType('file:///test.yaml')

            assert.deepStrictEqual(result, { logicalId: 'Bucket2', type: 'AWS::S3::Bucket' })
            assert.ok(showQuickPickStub.calledTwice)
        })

        it('should return undefined when user cancels type selection', async function () {
            getAuthoredResourceTypesV2Stub.resolves([{ logicalId: 'MyBucket', type: 'AWS::S3::Bucket' }])
            showQuickPickStub.resolves(undefined)

            const result = await selector.selectAuthoredResourceType('file:///test.yaml')

            assert.strictEqual(result, undefined)
        })

        it('should return undefined when user cancels logical ID selection', async function () {
            getAuthoredResourceTypesV2Stub.resolves([
                { logicalId: 'Bucket1', type: 'AWS::S3::Bucket' },
                { logicalId: 'Bucket2', type: 'AWS::S3::Bucket' },
            ])
            showQuickPickStub.onFirstCall().resolves('AWS::S3::Bucket')
            showQuickPickStub.onSecondCall().resolves(undefined)

            const result = await selector.selectAuthoredResourceType('file:///test.yaml')

            assert.strictEqual(result, undefined)
        })

        it('should fall back to v1 endpoint when v2 method not found', async function () {
            getAuthoredResourceTypesV2Stub.rejects(new ResponseError(ErrorCodes.MethodNotFound, 'Method not found'))
            getAuthoredResourceTypesStub.resolves(['AWS::S3::Bucket', 'AWS::Lambda::Function'])
            showQuickPickStub.resolves('AWS::S3::Bucket')

            const result = await selector.selectAuthoredResourceType('file:///test.yaml')

            assert.ok(result)
            assert.strictEqual(result.type, 'AWS::S3::Bucket')
            assert.strictEqual(result.logicalId, 'Resource1')
            assert.ok(getAuthoredResourceTypesStub.calledOnce)
        })

        it('should rethrow non-method-not-found errors', async function () {
            getAuthoredResourceTypesV2Stub.rejects(new ResponseError(-32003, 'Credentials expired'))

            await assert.rejects(
                () => selector.selectAuthoredResourceType('file:///test.yaml'),
                (error: ResponseError<unknown>) => error.code === -32003
            )
            assert.ok(getAuthoredResourceTypesStub.notCalled)
        })
    })
})
