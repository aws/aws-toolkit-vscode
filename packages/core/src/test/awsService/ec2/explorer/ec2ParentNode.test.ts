/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { Ec2ParentNode } from '../../../../awsService/ec2/explorer/ec2ParentNode'
import { Ec2Client, SafeEc2Instance } from '../../../../shared/clients/ec2Client'
import { intoCollection } from '../../../../shared/utilities/collectionUtils'
import {
    assertNodeListOnlyHasErrorNode,
    assertNodeListOnlyHasPlaceholderNode,
} from '../../../utilities/explorerNodeAssertions'
import { Ec2InstanceNode } from '../../../../awsService/ec2/explorer/ec2InstanceNode'
import { EC2 } from 'aws-sdk'
import { AsyncCollection } from '../../../../shared/utilities/asyncCollection'
import * as FakeTimers from '@sinonjs/fake-timers'
import { installFakeClock } from '../../../testUtil'
import { PollingSet } from '../../../../shared/utilities/pollingSet'

describe('ec2ParentNode', function () {
    let testNode: Ec2ParentNode
    let defaultInstances: SafeEc2Instance[]
    let client: Ec2Client
    let getInstanceStub: sinon.SinonStub<[filters?: EC2.Filter[] | undefined], Promise<AsyncCollection<EC2.Instance>>>
    let clock: FakeTimers.InstalledClock
    let refreshStub: sinon.SinonStub<[], Promise<void>>
    let clearTimerStub: sinon.SinonStub<[], void>

    const testRegion = 'testRegion'
    const testPartition = 'testPartition'

    function mapToInstanceCollection(instances: SafeEc2Instance[]) {
        return intoCollection(
            instances.map((instance) => ({
                InstanceId: instance.InstanceId,
                LastSeenStatus: instance.LastSeenStatus,
                Tags: [{ Key: 'Name', Value: instance.Name }],
            }))
        )
    }

    before(function () {
        client = new Ec2Client(testRegion)
        clock = installFakeClock()
        refreshStub = sinon.stub(Ec2InstanceNode.prototype, 'refreshNode')
        clearTimerStub = sinon.stub(PollingSet.prototype, 'clearTimer')
        defaultInstances = [
            { Name: 'firstOne', InstanceId: '0', LastSeenStatus: 'running' },
            { Name: 'secondOne', InstanceId: '1', LastSeenStatus: 'running' },
        ]
    })

    beforeEach(function () {
        getInstanceStub = sinon.stub(Ec2Client.prototype, 'getInstances')
        defaultInstances = [
            { Name: 'firstOne', InstanceId: '0', LastSeenStatus: 'running' },
            { Name: 'secondOne', InstanceId: '1', LastSeenStatus: 'stopped' },
        ]

        getInstanceStub.callsFake(async () =>
            intoCollection(
                defaultInstances.map((instance) => ({
                    InstanceId: instance.InstanceId,
                    Tags: [{ Key: 'Name', Value: instance.Name }],
                }))
            )
        )

        testNode = new Ec2ParentNode(testRegion, testPartition, client)
        refreshStub.resetHistory()
        clearTimerStub.resetHistory()
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

        childNodes.forEach((node) =>
            assert.ok(node instanceof Ec2InstanceNode, 'Expected child node to be Ec2InstanceNode')
        )
        getInstanceStub.restore()
    })

    it('sorts child nodes', async function () {
        const sortedText = ['aa', 'ab', 'bb', 'bc', 'cc', 'cd']
        const instances = [
            { Name: 'ab', InstanceId: '0', LastSeenStatus: 'running' },
            { Name: 'bb', InstanceId: '1', LastSeenStatus: 'running' },
            { Name: 'bc', InstanceId: '2', LastSeenStatus: 'running' },
            { Name: 'aa', InstanceId: '3', LastSeenStatus: 'running' },
            { Name: 'cc', InstanceId: '4', LastSeenStatus: 'running' },
            { Name: 'cd', InstanceId: '5', LastSeenStatus: 'running' },
        ]

        getInstanceStub.resolves(mapToInstanceCollection(instances))

        const childNodes = await testNode.getChildren()

        const actualChildOrder = childNodes.map((node) => (node instanceof Ec2InstanceNode ? node.name : undefined))
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
            { Name: 'firstOne', InstanceId: '0', LastSeenStatus: 'running' },
            { Name: 'secondOne', InstanceId: '1', LastSeenStatus: 'running' },
            { Name: 'firstOne', InstanceId: '2', LastSeenStatus: 'running' },
        ]

        getInstanceStub.resolves(mapToInstanceCollection(instances))

        const childNodes = await testNode.getChildren()
        assert.strictEqual(childNodes.length, instances.length, 'Unexpected child count')
        getInstanceStub.restore()
    })

    it('adds pending nodes to the polling nodes set', async function () {
        const instances = [
            { Name: 'firstOne', InstanceId: '0', LastSeenStatus: 'pending' },
            { Name: 'secondOne', InstanceId: '1', LastSeenStatus: 'stopped' },
            { Name: 'thirdOne', InstanceId: '2', LastSeenStatus: 'running' },
        ]

        getInstanceStub.resolves(mapToInstanceCollection(instances))

        await testNode.updateChildren()
        assert.strictEqual(testNode.pollingSet.size, 1)
        getInstanceStub.restore()
    })

    it('does not refresh explorer when timer goes off if status unchanged', async function () {
        const statusUpdateStub = sinon.stub(Ec2Client.prototype, 'getInstanceStatus').resolves('pending')
        const instances = [
            { Name: 'firstOne', InstanceId: '0', LastSeenStatus: 'pending' },
            { Name: 'secondOne', InstanceId: '1', LastSeenStatus: 'stopped' },
            { Name: 'thirdOne', InstanceId: '2', LastSeenStatus: 'running' },
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
        testNode.pollingSet.add('0')
        await clock.tickAsync(6000)
        sinon.assert.called(refreshStub)
        statusUpdateStub.restore()
    })
})
