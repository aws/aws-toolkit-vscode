/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { SSM } from 'aws-sdk'
import * as sinon from 'sinon'
import { DocumentItemNode } from '../../../ssmDocument/explorer/documentItemNode'
import { MockSsmDocumentClient } from '../../shared/clients/mockClients'

describe('DocumentItemNode', async function() {
    let sandbox: sinon.SinonSandbox
    let testNode: DocumentItemNode
    const testDoc: SSM.DocumentIdentifier = {
        Name: 'testDoc',
        Owner: 'Amazon',
    }
    const fakeRegion = 'us-east-1'

    beforeEach(function() {
        sandbox = sinon.createSandbox()
        testNode = new DocumentItemNode(testDoc, new MockSsmDocumentClient(), fakeRegion)
    })

    afterEach(function() {
        sandbox.restore()
    })

    it('initializes name, owner, context value', async function() {
        assert.strictEqual(testNode.label, testDoc.Name)
        assert.strictEqual(testNode.documentName, testDoc.Name)
        assert.strictEqual(testNode.documentOwner, testDoc.Owner)
        assert.strictEqual(testNode.contextValue, 'awsDocumentItemNode')
    })

    it('has no children', async function() {
        const childNode = await testNode.getChildren()
        assert(childNode !== undefined)
        assert.strictEqual(childNode.length, 0)
    })
})
