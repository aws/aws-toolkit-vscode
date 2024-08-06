/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { ExtContext } from '../../../shared'
import * as dynamoDbUtils from '../../../dynamoDb/utils/dynamodb'
import {
    DynamoDbTableWebview,
    DynamoDbTableData,
    viewDynamoDbTable,
    getDynamoDbTableData,
} from '../../../dynamoDb/vue/tableView'

describe('TableView', () => {
    let sandbox: sinon.SinonSandbox
    let dynamoDbTableData: DynamoDbTableData
    let extContext: ExtContext

    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    function createWebview(tableData = dynamoDbTableData): DynamoDbTableWebview {
        return new DynamoDbTableWebview(tableData)
    }

    function getExpectedResponse() {
        const expectedResponse: DynamoDbTableData = {
            tableName: 'test-table',
            region: 'west-us-2',
            currentPage: 1,
            tableContent: [],
            tableHeader: [],
            lastEvaluatedKey: undefined,
        }
        return expectedResponse
    }

    describe('fetchPageData', function () {
        afterEach(() => {
            sinon.restore()
        })

        it('should fetch the table information', async () => {
            const tableData = sinon.stub(dynamoDbTableData)
            tableData.tableName = 'test-table'
            tableData.region = 'west-us-2'

            sinon.stub(dynamoDbUtils, 'getTableContent').resolves(getExpectedResponse())
            const webView = createWebview(tableData)
            const actualResponse = await webView.fetchPageData()

            assert.deepEqual(actualResponse, getExpectedResponse())
        })
    })

    describe('queryData', function () {
        it('should query the table', async () => {
            const tableData = sinon.stub(dynamoDbTableData)
            tableData.tableName = 'test-table'
            tableData.region = 'west-us-2'
            tableData.currentPage = 1

            sinon.stub(dynamoDbUtils, 'queryTableContent').resolves(getExpectedResponse())
            const webView = createWebview(tableData)
            const actualResponse = await webView.queryData({ partitionKey: 'library', sortKey: 'as' })

            assert.deepEqual(actualResponse, getExpectedResponse())
        })
    })

    describe('getTableSchema', function () {
        it('should get the table schema', async () => {
            const tableData = sinon.stub(dynamoDbTableData)
            tableData.tableName = 'test-table'
            tableData.region = 'west-us-2'

            const expectedResult = {
                partitionKey: { name: 'PK', dataType: 'S' },
                sortKey: { name: 'SK', dataType: 'S' },
            }

            sinon.stub(dynamoDbUtils, 'getTableKeySchema').resolves(expectedResult)
            const webView = createWebview(tableData)
            const actualResponse = await webView.getTableSchema()

            assert.deepEqual(actualResponse, expectedResult)
        })
    })

    describe('getDynamoDbTableData', function () {
        afterEach(() => {
            sinon.restore()
        })

        it('should get the table data', async () => {
            sinon.stub(dynamoDbUtils, 'getTableContent').resolves(getExpectedResponse())

            const actualResult = await getDynamoDbTableData({ TableName: 'test-table', Limit: 5 }, 'west-us-2')
            assert.deepEqual(actualResult, getExpectedResponse())
        })
    })

    describe('viewDynamoDbTable', function () {
        it('should view the table', async () => {
            const context = sinon.stub(extContext)
            const node = { dynamoDbtable: 'test-table', regionCode: 'west-us-2' }

            const getTableContentStub = sinon.stub(dynamoDbUtils, 'getTableContent').resolves(getExpectedResponse())

            await viewDynamoDbTable(context, node)
            assert.ok(getTableContentStub.calledOnce)
        })
    })
})
