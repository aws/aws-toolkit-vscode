/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { SSM } from 'aws-sdk'
import { DefaultSsmDocumentClient } from '../../../shared/clients/ssmDocumentClient'
import { DocumentItemNode } from '../../../ssmDocument/explorer/documentItemNode'
import { stub } from '../../utilities/stubber'

describe('DocumentItemNode', async function () {
    let testNode: DocumentItemNode
    const testDoc: SSM.DocumentIdentifier = {
        Name: 'testDoc',
        Owner: 'Amazon',
    }
    const fakeRegion = 'us-east-1'

    beforeEach(function () {
        const client = stub(DefaultSsmDocumentClient, { regionCode: fakeRegion })
        testNode = new DocumentItemNode(testDoc, client, fakeRegion)
    })

    it('initializes name, owner, context value', async function () {
        assert.strictEqual(testNode.label, testDoc.Name)
        assert.strictEqual(testNode.documentName, testDoc.Name)
        assert.strictEqual(testNode.documentOwner, testDoc.Owner)
        assert.strictEqual(testNode.contextValue, 'awsDocumentItemNode')
    })

    it('has no children', async function () {
        const childNode = await testNode.getChildren()
        assert(childNode !== undefined)
        assert.strictEqual(childNode.length, 0)
    })
})
