/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { ExtContext } from '../../../../shared'
import * as settings from '../../../../shared/settings'
import * as edit from '../../../../awsService/dynamoDb/utils/editItem'
import * as utilities from '../../../../shared/utilities/messages'
import * as dynamoDbUtils from '../../../../awsService/dynamoDb/utils/dynamodb'
import * as messagesUtils from '../../../../shared/utilities/messages'
import {
    DynamoDbTableWebview,
    DynamoDbTableData,
    viewDynamoDbTable,
    getDynamoDbTableData,
} from '../../../../awsService/dynamoDb/vue/tableView'

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
            const tableSchema: dynamoDbUtils.TableSchema = {
                partitionKey: { name: 'key1', dataType: 'S' },
            }
            sinon.stub(dynamoDbUtils, 'getTableContent').resolves(getExpectedResponse())
            const webView = createWebview(tableData)
            const actualResponse = await webView.fetchPageData(tableSchema)

            assert.deepEqual(actualResponse, getExpectedResponse())
        })
    })

    describe('queryData', function () {
        it('should query the table', async () => {
            const tableData = sinon.stub(dynamoDbTableData)
            tableData.tableName = 'test-table'
            tableData.region = 'west-us-2'
            tableData.currentPage = 1
            const tableSchema: dynamoDbUtils.TableSchema = {
                partitionKey: { name: 'key1', dataType: 'S' },
            }

            sinon.stub(dynamoDbUtils, 'queryTableContent').resolves(getExpectedResponse())
            const webView = createWebview(tableData)
            const actualResponse = await webView.queryData({ partitionKey: 'library', sortKey: 'as' }, tableSchema)

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
            const tableSchema: dynamoDbUtils.TableSchema = {
                partitionKey: { name: 'key1', dataType: 'S' },
            }
            const actualResult = await getDynamoDbTableData(
                { TableName: 'test-table', Limit: 5 },
                'west-us-2',
                tableSchema
            )
            assert.deepEqual(actualResult, getExpectedResponse())
        })
    })

    describe('viewDynamoDbTable', function () {
        it('should view the table', async () => {
            const context = sinon.stub(extContext)
            const tableSchema: dynamoDbUtils.TableSchema = {
                partitionKey: { name: 'key1', dataType: 'S' },
            }
            const node = { dynamoDbtable: 'test-table', regionCode: 'west-us-2' }
            const getTableKeySchemaStub = sinon.stub(dynamoDbUtils, 'getTableKeySchema').resolves(tableSchema)
            const getTableContentStub = sinon.stub(dynamoDbUtils, 'getTableContent').resolves(getExpectedResponse())

            await viewDynamoDbTable(context, node)
            assert.ok(getTableContentStub.calledOnce)
            assert.ok(getTableKeySchemaStub.calledOnce)
        })
    })

    describe('copyCell', function () {
        it('should copy the selectedCell to clipboard', async () => {
            const copyToClipboardStub = sinon.stub(messagesUtils, 'copyToClipboard').resolves()
            const tableData = sinon.stub(dynamoDbTableData)

            const webView = createWebview(tableData)
            await webView.copyCell('selectedCell')

            assert.ok(copyToClipboardStub.calledOnce)
        })
    })

    describe('copyRow', function () {
        this.beforeEach(() => {
            sinon.restore()
            sandbox = sinon.createSandbox()
        })

        it('should copy the selectedRow to clipboard', async () => {
            const copyToClipboardStub = sinon.stub(messagesUtils, 'copyToClipboard').resolves()
            const tableData = sinon.stub(dynamoDbTableData)

            const webView = createWebview(tableData)
            await webView.copyRow({ key1: 'value' })

            assert.ok(copyToClipboardStub.calledOnce)
        })
    })

    describe('editItem', function () {
        it('should edit the item', async () => {
            const editItemStub = sinon.stub(edit, 'editItem').resolves()
            const tableData = sinon.stub(dynamoDbTableData)

            const webView = createWebview(tableData)
            await webView.editItem({ key1: 'value' }, { partitionKey: { name: 'key1', dataType: 'S' } })

            assert.ok(editItemStub.calledOnce)
        })
    })

    describe('openPageSizeSettings', function () {
        it('should open page size settings', async () => {
            const openSettingsStub = sinon.stub(settings, 'openSettings').resolves()
            const tableData = sinon.stub(dynamoDbTableData)

            const webView = createWebview(tableData)
            await webView.openPageSizeSettings()

            assert.ok(openSettingsStub.calledOnce)
        })
    })

    describe('deleteItem', function () {
        afterEach(() => {
            sandbox.restore()
        })

        beforeEach(() => {
            sinon.restore()
            sandbox = sinon.createSandbox()
        })

        it('should not delete if not confirmed', async () => {
            const showConfirmationMessageStub = sinon.stub(utilities, 'showConfirmationMessage').resolves(false)
            const tableData = sinon.stub(dynamoDbTableData)

            const webView = createWebview(tableData)
            await webView.deleteItem({ key1: 'value' }, { partitionKey: { name: 'key1', dataType: 'S' } })
            assert.ok(showConfirmationMessageStub.calledOnce)
        })

        it('should delete if confirmed', async () => {
            const showConfirmationMessageStub = sinon.stub(utilities, 'showConfirmationMessage').resolves(true)
            const deleteItemStub = sinon.stub(dynamoDbUtils, 'deleteItem').resolves()
            sinon.stub(dynamoDbUtils, 'getTableContent').resolves(getExpectedResponse())

            const tableData = sinon.stub(dynamoDbTableData)
            tableData.lastEvaluatedKey = undefined
            const webView = createWebview(tableData)
            await webView.deleteItem({ key1: 'value' }, { partitionKey: { name: 'key1', dataType: 'S' } })

            assert.ok(showConfirmationMessageStub.calledOnce)
            assert.ok(deleteItemStub.calledOnce)
        })
    })
})
