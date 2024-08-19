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
import { assertTelemetry } from '../../testUtil'

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
    async function testDeleteDynamoDB(confirmed: boolean) {
        const expectedResult = { TableDescription: { TableName: 'Table1' } } as unknown as DeleteTableOutput
        const parentNode = { refreshNode: sinon.stub() }

        const showConfirmationMessageStub = sinon.stub(utilities, 'showConfirmationMessage').resolves(confirmed)
        dynamoDbTableNode.parentNode = parentNode as unknown as DynamoDbInstanceNode
        sinon
            .stub(dynamoDbClient, 'deleteTable')
            .resolves(Promise.resolve(expectedResult) as unknown as PromiseResult<DeleteTableOutput, AWSError>)
        await deleteDynamoDbTable(dynamoDbTableNode, dynamoDbClient)
        assert.ok(showConfirmationMessageStub.called)
    }
    it('Yes confirmation should delete a DynamoDB table', async () => {
        await testDeleteDynamoDB(true)
    })

    it('No confirmation should not delete a DynamoDB table', async () => {
        await testDeleteDynamoDB(false)
    })

    it('Delete failed after confirmation', async () => {
        const parentNode = { refreshNode: sinon.stub() }

        const showConfirmationMessageStub = sinon.stub(utilities, 'showConfirmationMessage').resolves(true)
        dynamoDbTableNode.parentNode = parentNode as unknown as DynamoDbInstanceNode
        dynamoDbTableNode.dynamoDbtable = 'table1'

        try {
            sinon
                .stub(dynamoDbClient, 'deleteTable')
                .resolves(Promise.resolve({}) as unknown as PromiseResult<DeleteTableOutput, AWSError>)
            await deleteDynamoDbTable(dynamoDbTableNode, dynamoDbClient)
        } catch (e) {
            assert.equal((e as any).message, 'Failed to delete DynamoDB table: table1')
        }

        assert.ok(showConfirmationMessageStub.called)
        assertTelemetry('dynamodb_deleteTable', { result: 'Failed' })
    })

    it('Delete success after confirmation', async () => {
        const parentNode = { refreshNode: sinon.stub() }
        const expectedResult = { TableDescription: { TableName: 'Table1' } } as unknown as DeleteTableOutput

        const showConfirmationMessageStub = sinon.stub(utilities, 'showConfirmationMessage').resolves(true)
        dynamoDbTableNode.parentNode = parentNode as unknown as DynamoDbInstanceNode
        dynamoDbTableNode.dynamoDbtable = 'table1'

        sinon
            .stub(dynamoDbClient, 'deleteTable')
            .resolves(Promise.resolve(expectedResult) as unknown as PromiseResult<DeleteTableOutput, AWSError>)
        await deleteDynamoDbTable(dynamoDbTableNode, dynamoDbClient)

        assert.ok(showConfirmationMessageStub.called)
        assertTelemetry('dynamodb_deleteTable', { result: 'Succeeded' })
    })
})
