/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as FakeTimers from '@sinonjs/fake-timers'
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
import { installFakeClock } from '../../testUtil'

describe('ec2ParentNode', function () {
    let testNode: Ec2ParentNode
    let defaultInstances: Ec2Instance[]
    let client: Ec2Client
    let getInstanceStub: sinon.SinonStub<[filters?: EC2.Filter[] | undefined], Promise<AsyncCollection<EC2.Instance>>>
    let clock: FakeTimers.InstalledClock
    let refreshStub: sinon.SinonStub<[], Promise<void>>
    let clearTimerStub: sinon.SinonStub<[], void>

    const testRegion = 'testRegion'
    const testPartition = 'testPartition'

    function mapToInstanceCollection(instances: Ec2Instance[]) {
        return intoCollection(
            instances.map(instance => ({
                InstanceId: instance.InstanceId,
                status: instance.status,
                Tags: [{ Key: 'Name', Value: instance.name }],
            }))
        )
    }

    before(function () {
        client = new Ec2Client(testRegion)
        clock = installFakeClock()
        refreshStub = sinon.stub(Ec2InstanceNode.prototype, 'refreshNode')
        clearTimerStub = sinon.stub(Ec2ParentNode.prototype, 'clearPollTimer')
        defaultInstances = [
            { name: 'firstOne', InstanceId: '0' },
            { name: 'secondOne', InstanceId: '1' },
        ]
    })

    after(function () {
        sinon.restore()
    })

    beforeEach(function () {
        getInstanceStub = sinon.stub(Ec2Client.prototype, 'getInstances')
        defaultInstances = [
            { name: 'firstOne', InstanceId: '0', status: 'running' },
            { name: 'secondOne', InstanceId: '1', status: 'stopped' },
        ]

        testNode = new Ec2ParentNode(testRegion, testPartition, client)
        refreshStub.resetHistory()
    })

    afterEach(function () {
        getInstanceStub.restore()
    })

    after(function () {
        clock.uninstall()
        sinon.restore()
    })

    it('returns placeholder node if no children are present', async function () {
        getInstanceStub.resolves(mapToInstanceCollection([]))

        const childNodes = await testNode.getChildren()
        assertNodeListOnlyHasPlaceholderNode(childNodes)
        getInstanceStub.restore()
    })

    it('has instance child nodes', async function () {
        getInstanceStub.resolves(mapToInstanceCollection(defaultInstances))
        const childNodes = await testNode.getChildren()

        assert.strictEqual(childNodes.length, defaultInstances.length, 'Unexpected child count')

        childNodes.forEach(node =>
            assert.ok(node instanceof Ec2InstanceNode, 'Expected child node to be Ec2InstanceNode')
        )
        getInstanceStub.restore()
    })

    it('sorts child nodes', async function () {
        const sortedText = ['aa', 'ab', 'bb', 'bc', 'cc', 'cd']
        const instances = [
            { name: 'ab', InstanceId: '0', status: 'running' },
            { name: 'bb', InstanceId: '1', status: 'running' },
            { name: 'bc', InstanceId: '2', status: 'running' },
            { name: 'aa', InstanceId: '3', status: 'running' },
            { name: 'cc', InstanceId: '4', status: 'running' },
            { name: 'cd', InstanceId: '5', status: 'running' },
        ]

        getInstanceStub.resolves(mapToInstanceCollection(instances))

        const childNodes = await testNode.getChildren()

        const actualChildOrder = childNodes.map(node => (node instanceof Ec2InstanceNode ? node.name : undefined))
        assert.deepStrictEqual(actualChildOrder, sortedText, 'Unexpected child sort order')
        getInstanceStub.restore()
    })

    it('has an error node for a child if an error happens during loading', async function () {
        getInstanceStub.throws(new Error())
        const node = new Ec2ParentNode(testRegion, testPartition, client)
        assertNodeListOnlyHasErrorNode(await node.getChildren())
        getInstanceStub.restore()
    })

    it('is able to handle children with duplicate names', async function () {
        const instances = [
            { name: 'firstOne', InstanceId: '0', status: 'running' },
            { name: 'secondOne', InstanceId: '1', status: 'running' },
            { name: 'firstOne', InstanceId: '2', status: 'running' },
        ]

        getInstanceStub.resolves(mapToInstanceCollection(instances))

        const childNodes = await testNode.getChildren()
        assert.strictEqual(childNodes.length, instances.length, 'Unexpected child count')
        getInstanceStub.restore()
    })

    it('is not polling on initialization', async function () {
        assert.strictEqual(testNode.isPolling(), false)
    })

    it('adds pending nodes to the polling nodes set', async function () {
        const instances = [
            { name: 'firstOne', InstanceId: '0', status: 'pending' },
            { name: 'secondOne', InstanceId: '1', status: 'stopped' },
            { name: 'thirdOne', InstanceId: '2', status: 'running' },
        ]

        getInstanceStub.resolves(mapToInstanceCollection(instances))

        await testNode.updateChildren()
        assert.strictEqual(testNode.pollingNodes.size, 1)
        getInstanceStub.restore()
    })

    it('does not refresh explorer when timer goes off if status unchanged', async function () {
        const statusUpdateStub = sinon.stub(Ec2Client.prototype, 'getInstanceStatus').resolves('pending')
        const instances = [
            { name: 'firstOne', InstanceId: '0', status: 'pending' },
            { name: 'secondOne', InstanceId: '1', status: 'stopped' },
            { name: 'thirdOne', InstanceId: '2', status: 'running' },
        ]

        getInstanceStub.resolves(mapToInstanceCollection(instances))

        await testNode.updateChildren()
        await clock.tickAsync(6000)
        sinon.assert.notCalled(refreshStub)
        statusUpdateStub.restore()
        getInstanceStub.restore()
    })

    it('does refresh explorer when timer goes and status changed', async function () {
        sinon.assert.notCalled(refreshStub)
        const statusUpdateStub = sinon.stub(Ec2Client.prototype, 'getInstanceStatus').resolves('running')
        testNode.pollingNodes.add('0')
        await clock.tickAsync(6000)
        sinon.assert.called(refreshStub)
        statusUpdateStub.restore()
    })

    it('stops timer once polling nodes are empty', async function () {
        const instances = [
            { name: 'firstOne', InstanceId: '0', status: 'pending' },
            { name: 'secondOne', InstanceId: '1', status: 'stopped' },
            { name: 'thirdOne', InstanceId: '2', status: 'running' },
        ]

        getInstanceStub.resolves(mapToInstanceCollection(instances))

        await testNode.updateChildren()

        assert.strictEqual(testNode.isPolling(), true)
        testNode.pollingNodes.delete('0')
        await clock.tickAsync(6000)
        assert.strictEqual(testNode.isPolling(), false)
        sinon.assert.calledOn(clearTimerStub, testNode)
        getInstanceStub.restore()
    })
})
