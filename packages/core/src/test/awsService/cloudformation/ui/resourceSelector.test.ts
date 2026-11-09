/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { ResourceSelector, ResourceOperations } from '../../../../awsService/cloudformation/ui/resourceSelector'
import { getTestWindow } from '../../../shared/vscode/window'
import { SeverityLevel } from '../../../shared/vscode/message'

describe('ResourceSelector - search error handling', () => {
    let sandbox: sinon.SinonSandbox
    let mockClient: any
    let resourceSelector: ResourceSelector
    let mockResourceOperations: ResourceOperations

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        mockClient = { sendRequest: sandbox.stub() }
        resourceSelector = new ResourceSelector(mockClient)

        mockResourceOperations = {
            getCached: sandbox.stub().returns({
                typeName: 'AWS::S3::Bucket',
                resourceIdentifiers: ['id1'],
                nextToken: 'token',
            }),
            loadMore: sandbox.stub().resolves(),
            search: sandbox.stub(),
        }

        // Setup UI interactions: select "Search" from quick pick, then enter identifier
        getTestWindow().onDidShowQuickPick((picker) => {
            const searchItem = picker.items.find((i) => i.label.includes('Search'))
            if (searchItem) {
                picker.acceptItem(searchItem)
            }
        })
        getTestWindow().onDidShowInputBox((input) => {
            input.acceptValue('my-resource-id')
        })
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('should display result.error when search fails with error message', async () => {
        ;(mockResourceOperations.search as sinon.SinonStub).resolves({
            found: false,
            error: 'Resource does not exist in the account',
        })

        const result = await resourceSelector.selectResources(true, ['AWS::S3::Bucket'], mockResourceOperations)

        const message = getTestWindow().getFirstMessage()
        assert.strictEqual(message.message, 'Resource does not exist in the account')
        message.assertSeverity(SeverityLevel.Error)
        assert.deepStrictEqual(result, [])
    })

    it('should display default not-found message when search fails without error', async () => {
        ;(mockResourceOperations.search as sinon.SinonStub).resolves({
            found: false,
        })

        const result = await resourceSelector.selectResources(true, ['AWS::S3::Bucket'], mockResourceOperations)

        const message = getTestWindow().getFirstMessage()
        assert.strictEqual(message.message, "AWS::S3::Bucket with identifier 'my-resource-id' was not found")
        message.assertSeverity(SeverityLevel.Error)
        assert.deepStrictEqual(result, [])
    })
})
