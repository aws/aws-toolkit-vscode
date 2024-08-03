/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { AWSError } from 'aws-sdk'
import { PromiseResult } from 'aws-sdk/lib/request'
import { DynamoDbClient } from '../../../shared/clients/dynamoDbClient'
import { DeleteTableOutput, QueryOutput, ScanOutput, TableDescription } from 'aws-sdk/clients/dynamodb'

function generateRequest<T>(output?: T): PromiseResult<T, AWSError> {
    return Promise.resolve(output) as unknown as PromiseResult<T, AWSError>
}

describe('DynamoDbClient', () => {
    let dynamoDbClient: DynamoDbClient
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        dynamoDbClient = new DynamoDbClient('us-west-2')
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('getTables', function () {
        it('should retrieve a list of table names', async () => {
            async function* getTablesGenerator() {
                yield 'Table1'
            }
            sinon.stub(dynamoDbClient, 'getTables').callsFake(() => getTablesGenerator())
            const result: string[] = []
            for await (const tableName of dynamoDbClient.getTables()) {
                result.push(tableName)
            }

            assert.deepStrictEqual(result, ['Table1'])
        })

        it('should handle no table names', async () => {
            // eslint-disable-next-line require-yield
            async function* listTablesGenerator() {
                return
            }
            sinon.stub(dynamoDbClient, 'getTables').callsFake(() => listTablesGenerator())
            const result: string[] = []
            for await (const tableName of dynamoDbClient.getTables()) {
                result.push(tableName)
            }

            assert.deepStrictEqual(result, [])
        })
    })

    describe('getTableInformation', function () {
        it('should retrieve a information about a table', async () => {
            const request = { TableName: 'Table1' }
            const expectedResult = { TableName: 'Table1' } as unknown as TableDescription

            sinon.stub(dynamoDbClient, 'getTableInformation').resolves(expectedResult)
            const actualResult = await dynamoDbClient.getTableInformation(request)
            assert.deepStrictEqual(expectedResult, actualResult)
        })

        it('should handle an AWSError correctly', async () => {
            const request = { TableName: 'Table1' }

            sinon.stub(dynamoDbClient, 'getTableInformation').rejects()

            try {
                await dynamoDbClient.getTableInformation(request)
                assert.fail('Expected error not thrown')
            } catch (err: any) {
                assert.equal(err.message, 'Error')
            }
        })
    })

    describe('scanTable', function () {
        it('should retrieve the items from a table', async () => {
            const request = { TableName: 'Table1' }
            const expectedResult = { Items: { data: 'value' } } as unknown as ScanOutput

            sinon.stub(dynamoDbClient, 'scanTable').resolves(generateRequest(expectedResult))
            const actualResult = await dynamoDbClient.scanTable(request)
            assert.deepStrictEqual(expectedResult, actualResult)
        })

        it('should handle an AWSError correctly', async () => {
            const request = { TableName: 'Table1' }

            sinon.stub(dynamoDbClient, 'scanTable').rejects()

            try {
                await dynamoDbClient.scanTable(request)
                assert.fail('Expected error not thrown')
            } catch (err: any) {
                assert.equal(err.message, 'Error')
            }
        })
    })

    describe('deleteTable', function () {
        it('should be able to delete a table', async () => {
            const request = { TableName: 'Table1' }
            const expectedResult = { TableDescription: { TableName: 'Table1' } } as unknown as DeleteTableOutput

            sinon.stub(dynamoDbClient, 'deleteTable').resolves(generateRequest(expectedResult))
            const actualResult = await dynamoDbClient.deleteTable(request)
            assert.deepStrictEqual(expectedResult, actualResult)
        })

        it('should handle an AWSError correctly', async () => {
            const request = { TableName: 'Table1' }

            sinon.stub(dynamoDbClient, 'deleteTable').rejects()

            try {
                await dynamoDbClient.deleteTable(request)
                assert.fail('Expected error not thrown')
            } catch (err: any) {
                assert.equal(err.message, 'Error')
            }
        })
    })

    describe('queryTable', function () {
        it('should be able to query data from a table', async () => {
            const request = { TableName: 'Table1' }
            const expectedResult = { Items: { data: 'value' } } as unknown as QueryOutput

            sinon.stub(dynamoDbClient, 'queryTable').resolves(generateRequest(expectedResult))
            const actualResult = await dynamoDbClient.queryTable(request)
            assert.deepStrictEqual(expectedResult, actualResult)
        })

        it('should handle an AWSError correctly', async () => {
            const request = { TableName: 'Table1' }

            sinon.stub(dynamoDbClient, 'queryTable').rejects()

            try {
                await dynamoDbClient.queryTable(request)
                assert.fail('Expected error not thrown')
            } catch (err: any) {
                assert.equal(err.message, 'Error')
            }
        })
    })
})
