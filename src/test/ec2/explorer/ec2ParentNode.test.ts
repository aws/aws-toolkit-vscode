/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as FakeTimers from '@sinonjs/fake-timers'
import * as sinon from 'sinon'
import { Ec2ParentNode } from '../../../ec2/explorer/ec2ParentNode'
import { stub } from '../../utilities/stubber'
import { Ec2Client, Ec2Instance } from '../../../shared/clients/ec2Client'
import { intoCollection } from '../../../shared/utilities/collectionUtils'
import {
    assertNodeListOnlyHasErrorNode,
    assertNodeListOnlyHasPlaceholderNode,
} from '../../utilities/explorerNodeAssertions'
import { Ec2InstanceNode } from '../../../ec2/explorer/ec2InstanceNode'
import { installFakeClock } from '../../testUtil'

describe('ec2ParentNode', function () {
    let testNode: Ec2ParentNode
    let instances: Ec2Instance[]
    let clock: FakeTimers.InstalledClock
    let refreshStub: sinon.SinonStub<[], Promise<void>>

    const testRegion = 'testRegion'
    const testPartition = 'testPartition'

    function createClient() {
        const client = stub(Ec2Client, { regionCode: testRegion })
        client.getInstances.callsFake(async () =>
            intoCollection(
                instances.map(instance => ({
                    InstanceId: instance.InstanceId,
                    status: instance.status,
                    Tags: [{ Key: 'Name', Value: instance.name }],
                }))
            )
        )

        return client
    }

    before(function () {
        clock = installFakeClock()
        refreshStub = sinon.stub(Ec2ParentNode.prototype, 'refreshNode')
    })

    beforeEach(function () {
        instances = [
            { name: 'firstOne', InstanceId: '0', status: 'pending' },
            { name: 'secondOne', InstanceId: '1', status: 'stopped' },
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

    it('is not polling on initialization', async function () {
        assert.strictEqual(testNode.isPolling(), false)
    })

    it('adds pending nodes to the polling nodes set', async function () {
        await testNode.updateChildren()
        assert.strictEqual(testNode.pollingNodes.size, 1)
    })

    it('refreshes explorer when timer goes off', async function () {
        await testNode.updateChildren()
        await clock.tickAsync(6000)
        sinon.assert.calledOn(refreshStub, testNode)
    })

    // it('deletes node from polling set when state changes', async function () {
    //     const mockChildNode: Ec2InstanceNode = mock()
    //     when(mockChildNode.getStatus()).thenReturn('running')
    //     testNode.startPolling(mockChildNode)
    //     await clock.tickAsync(4000)
    //     assert.strictEqual(testNode.isPolling(), false)
    // })

    // it('stops polling once node status has been updated', async function () {
    //     const mockChildNode: Ec2InstanceNode = mock()
    //     when(mockChildNode.getStatus()).thenReturn('running')
    //     testNode.startPolling(mockChildNode)
    //     await clock.tickAsync(4000)
    //     sinon.assert.calledOn(refreshStub, testNode)
    //     await clock.tickAsync(4000)
    //     sinon.assert.calledOnce(refreshStub)
    // })
})
