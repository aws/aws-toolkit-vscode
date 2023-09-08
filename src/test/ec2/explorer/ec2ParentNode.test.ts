/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { Ec2ParentNode } from '../../../ec2/explorer/ec2ParentNode'
import { Ec2Client, Ec2Instance } from '../../../shared/clients/ec2Client'
import { intoCollection } from '../../../shared/utilities/collectionUtils'
import {
    assertNodeListOnlyHasErrorNode,
    assertNodeListOnlyHasPlaceholderNode,
} from '../../utilities/explorerNodeAssertions'
import { Ec2InstanceNode } from '../../../ec2/explorer/ec2InstanceNode'
import { EC2 } from 'aws-sdk'
import { AsyncCollection } from '../../../shared/utilities/asyncCollection'

describe('ec2ParentNode', function () {
    let testNode: Ec2ParentNode
    let instances: Ec2Instance[]
    let client: Ec2Client
    let getInstanceStub: sinon.SinonStub<[filters?: EC2.Filter[] | undefined], Promise<AsyncCollection<EC2.Instance>>>

    const testRegion = 'testRegion'
    const testPartition = 'testPartition'

    before(function () {
        client = new Ec2Client(testRegion)
    })

    after(function () {
        sinon.restore()
    })

    beforeEach(function () {
        getInstanceStub = sinon.stub(Ec2Client.prototype, 'getInstances')
        instances = [
            { name: 'firstOne', InstanceId: '0' },
            { name: 'secondOne', InstanceId: '1' },
        ]

        getInstanceStub.callsFake(async () =>
            intoCollection(
                instances.map(instance => ({
                    InstanceId: instance.InstanceId,
                    Tags: [{ Key: 'Name', Value: instance.name }],
                }))
            )
        )

        testNode = new Ec2ParentNode(testRegion, testPartition, client)
    })

    afterEach(function () {
        getInstanceStub.restore()
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
        getInstanceStub.throws(new Error())
        const node = new Ec2ParentNode(testRegion, testPartition, client)
        assertNodeListOnlyHasErrorNode(await node.getChildren())
        getInstanceStub.restore()
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
