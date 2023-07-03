/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Ec2ParentNode, contextValueEc2 } from '../../../ec2/explorer/ec2ParentNode'
import { stub } from '../../utilities/stubber'
import { Ec2Client } from '../../../shared/clients/ec2Client'
import { intoCollection } from '../../../shared/utilities/collectionUtils'
import {
    assertNodeListOnlyHasErrorNode,
    assertNodeListOnlyHasPlaceholderNode,
} from '../../utilities/explorerNodeAssertions'
import { Ec2InstanceNode } from '../../../ec2/explorer/ec2InstanceNode'

describe('ec2ParentNode', function () {
    let testNode: Ec2ParentNode
    let instanceNames: string[]
    const testRegion = 'testRegion'
    const testPartition = ''

    function createClient() {
        const client = stub(Ec2Client, { regionCode: testRegion })
        client.getInstances.callsFake(async () =>
            intoCollection(
                instanceNames.map(name => ({ InstanceId: name + name, Tags: [{ Key: 'Name', Value: name }] }))
            )
        )

        return client
    }

    beforeEach(function () {
        instanceNames = ['firstOne', 'secondOne']
        testNode = new Ec2ParentNode(testRegion, testPartition, createClient())
    })

    it('returns placeholder node if no children are present', async function () {
        instanceNames = []

        const childNodes = await testNode.getChildren()

        assertNodeListOnlyHasPlaceholderNode(childNodes)
    })

    it('has instance child nodes', async function () {
        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, instanceNames.length, 'Unexpected child count')

        childNodes.forEach(node =>
            assert.ok(node instanceof Ec2InstanceNode, 'Expected child node to be Ec2InstanceNode')
        )
    })

    it('has child nodes with ec2 contextValuue', async function () {
        const childNodes = await testNode.getChildren()

        childNodes.forEach(node =>
            assert.strictEqual(node.contextValue, contextValueEc2, 'expected the node to have a ec2 contextValue')
        )
    })

    it('sorts child nodes', async function () {
        const sortedText = ['aa', 'ab', 'bb', 'bc', 'cc', 'cd']
        instanceNames = ['ab', 'bb', 'bc', 'aa', 'cc', 'cd']

        const childNodes = await testNode.getChildren()

        const actualChildOrder = childNodes.map(node => node.label)
        assert.deepStrictEqual(actualChildOrder, sortedText, 'Unexpected child sort order')
    })

    it('has an error node for a child if an error happens during loading', async function () {
        const client = createClient()
        client.getInstances.throws(new Error())

        const node = new Ec2ParentNode(testRegion, testPartition, client)
        assertNodeListOnlyHasErrorNode(await node.getChildren())
    })
})
