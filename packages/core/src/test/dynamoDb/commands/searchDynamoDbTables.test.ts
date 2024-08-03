/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { ExtContext } from '../../../shared'
import * as tableView from '../../../dynamoDb/vue/tableView'
import { searchDynamoDbTables } from '../../../dynamoDb/commands/searchDynamoDbTables'

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
        it('should be able to search tables', async () => {
            const viewDynamoDbTableStub = sinon.stub(tableView, 'viewDynamoDbTable')
            await searchDynamoDbTables(extContext, 'test', { regionName: 'us-west-2' })
            assert.ok(viewDynamoDbTableStub.calledOnce)
        })
    })
})
