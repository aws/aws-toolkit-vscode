/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Ec2ParentNode, contextValueEc2 } from '../../../ec2/explorer/ec2ParentNode'
import { stub } from '../../utilities/stubber'
import { Ec2Client, Ec2Instance } from '../../../shared/clients/ec2Client'
import { intoCollection } from '../../../shared/utilities/collectionUtils'
import {
    assertNodeListOnlyHasErrorNode,
    assertNodeListOnlyHasPlaceholderNode,
} from '../../utilities/explorerNodeAssertions'
import { Ec2InstanceNode } from '../../../ec2/explorer/ec2InstanceNode'

describe('ec2ParentNode', function () {
    let testNode: Ec2ParentNode
    let instances: Ec2Instance[]
    const testRegion = 'testRegion'
    const testPartition = 'testPartition'

    function createClient() {
        const client = stub(Ec2Client, { regionCode: testRegion })
        client.getInstances.callsFake(async () =>
            intoCollection(
                instances.map(instance => ({
                    InstanceId: instance.InstanceId,
                    Tags: [{ Key: 'Name', Value: instance.name }],
                }))
            )
        )

        return client
    }

    beforeEach(function () {
        instances = [
            { name: 'firstOne', InstanceId: '0' },
            { name: 'secondOne', InstanceId: '1' },
        ]

        testNode = new Ec2ParentNode(testRegion, testPartition, createClient())
    })

    it('returns placeholder node if no children are present', async function () {
        instances = []

        const childNodes = await testNode.getChildren()

        assertNodeListOnlyHasPlaceholderNode(childNodes)
    })

    it('has instance child nodes', async function () {
        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, instances.length, 'Unexpected child count')

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
        instances = [
            { name: 'ab', InstanceId: '0' },
            { name: 'bb', InstanceId: '1' },
            { name: 'bc', InstanceId: '2' },
            { name: 'aa', InstanceId: '3' },
            { name: 'cc', InstanceId: '4' },
            { name: 'cd', InstanceId: '5' },
        ]

        const childNodes = await testNode.getChildren()

        const actualChildOrder = childNodes.map(node => (node instanceof Ec2InstanceNode ? node.name : undefined))
        assert.deepStrictEqual(actualChildOrder, sortedText, 'Unexpected child sort order')
    })

    it('has an error node for a child if an error happens during loading', async function () {
        const client = createClient()
        client.getInstances.throws(new Error())

        const node = new Ec2ParentNode(testRegion, testPartition, client)
        assertNodeListOnlyHasErrorNode(await node.getChildren())
    })

    it('is able to handle children with duplicate names', async function () {
        instances = [
            { name: 'firstOne', InstanceId: '0' },
            { name: 'secondOne', InstanceId: '1' },
            { name: 'firstOne', InstanceId: '2' },
        ]

        const childNodes = await testNode.getChildren()
        assert.strictEqual(childNodes.length, instances.length, 'Unexpected child count')
    })
})
