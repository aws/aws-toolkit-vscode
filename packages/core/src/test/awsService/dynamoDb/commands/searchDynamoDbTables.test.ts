/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { ExtContext } from '../../../../shared'
import * as tableView from '../../../../awsService/dynamoDb/vue/tableView'
import { searchDynamoDbTables } from '../../../../awsService/dynamoDb/commands/searchDynamoDbTables'
import { assertTelemetry } from '../../../testUtil'

describe('SearchDynamoDbTables', () => {
    let sandbox: sinon.SinonSandbox
    let extContext: ExtContext

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        extContext = sinon.stub(extContext)
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('searchDynamoDbTables', function () {
        it('should search tables', async () => {
            const viewDynamoDbTableStub = sinon.stub(tableView, 'viewDynamoDbTable')
            await searchDynamoDbTables(extContext, 'test', { regionName: 'us-west-2' })
            assert.ok(viewDynamoDbTableStub.calledOnce)
            assertTelemetry('dynamodb_openTable', { result: 'Succeeded' })
        })
    })
})
