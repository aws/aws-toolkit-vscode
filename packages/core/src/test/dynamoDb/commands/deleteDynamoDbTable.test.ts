/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { DynamoDbClient } from '../../../shared/clients/dynamoDbClient'
import { deleteDynamoDbTable } from '../../../dynamoDb/commands/deleteDynamoDbTable'
import { DynamoDbTableNode } from '../../../dynamoDb/explorer/dynamoDbTableNode'
import { AWSError } from 'aws-sdk'
import { DeleteTableOutput } from 'aws-sdk/clients/dynamodb'
import { PromiseResult } from 'aws-sdk/lib/request'
import * as utilities from '../../../shared/utilities/messages'
import { DynamoDbInstanceNode } from '../../../dynamoDb/explorer/dynamoDbInstanceNode'

describe('deleteDynamoDbTable', () => {
    let dynamoDbClient: DynamoDbClient
    let dynamoDbTableNode: DynamoDbTableNode

    beforeEach(() => {
        dynamoDbTableNode = sinon.stub() as unknown as DynamoDbTableNode
        dynamoDbClient = new DynamoDbClient('us-west-2')
    })

    afterEach(() => {
        sinon.restore()
    })

    it('should successfully delete a DynamoDB table', async () => {
        const expectedResult = { TableDescription: { TableName: 'Table1' } } as unknown as DeleteTableOutput
        const parentNode = { refresh: sinon.stub() }

        const showConfirmationMessageStub = sinon.stub(utilities, 'showConfirmationMessage').resolves(true)
        dynamoDbTableNode.parentNode = parentNode as unknown as DynamoDbInstanceNode

        sinon
            .stub(dynamoDbClient, 'deleteTable')
            .resolves(Promise.resolve(expectedResult) as unknown as PromiseResult<DeleteTableOutput, AWSError>)
        await deleteDynamoDbTable(dynamoDbTableNode, dynamoDbClient)
        assert.ok(showConfirmationMessageStub.called)
    })

    it('should not delete a DynamoDB table', async () => {
        const expectedResult = { TableDescription: { TableName: 'Table1' } } as unknown as DeleteTableOutput
        const parentNode = { refresh: sinon.stub() }

        const showConfirmationMessageStub = sinon.stub(utilities, 'showConfirmationMessage').resolves(false)
        dynamoDbTableNode.parentNode = parentNode as unknown as DynamoDbInstanceNode

        sinon
            .stub(dynamoDbClient, 'deleteTable')
            .resolves(Promise.resolve(expectedResult) as unknown as PromiseResult<DeleteTableOutput, AWSError>)
        await deleteDynamoDbTable(dynamoDbTableNode, dynamoDbClient)
        assert.ok(showConfirmationMessageStub.called)
    })
})
