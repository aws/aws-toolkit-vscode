/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import {
    Ec2InstanceNode,
    Ec2InstancePendingContext,
    Ec2InstanceRunningContext,
    Ec2InstanceStoppedContext,
} from '../../../ec2/explorer/ec2InstanceNode'
import { Ec2Client, Ec2Instance, getNameOfInstance } from '../../../shared/clients/ec2Client'
import { Ec2ParentNode } from '../../../ec2/explorer/ec2ParentNode'

describe('ec2InstanceNode', function () {
    let testNode: Ec2InstanceNode
    let testInstance: Ec2Instance
    const testRegion = 'testRegion'
    const testPartition = 'testPartition'

    before(function () {
        testInstance = {
            InstanceId: 'testId',
            Tags: [
                {
                    Key: 'Name',
                    Value: 'testName',
                },
            ],
            status: 'running',
        }
        const testClient = new Ec2Client('')
        const testParentNode = new Ec2ParentNode(testRegion, testPartition, testClient)
        testNode = new Ec2InstanceNode(testParentNode, testClient, 'testRegion', 'testPartition', testInstance)
    })

    this.beforeEach(function () {
        testNode.updateInstance(testInstance)
    })

    it('instantiates without issue', async function () {
        assert.ok(testNode)
    })

    it('initializes the region code', async function () {
        assert.strictEqual(testNode.regionCode, 'testRegion')
    })

    it('initializes the label', async function () {
        assert.strictEqual(testNode.label, `${getNameOfInstance(testInstance)} (${testInstance.InstanceId})`)
    })

    it('initializes the functionName', async function () {
        assert.strictEqual(testNode.name, getNameOfInstance(testInstance))
    })

    it('has no children', async function () {
        const childNodes = await testNode.getChildren()
        assert.ok(childNodes)
        assert.strictEqual(childNodes.length, 0, 'Expected node to have no children')
    })

    it('has an EC2ParentNode as parent', async function () {
        assert.ok(testNode.parent instanceof Ec2ParentNode)
    })

    it('intializes the client', async function () {
        assert.ok(testNode.client instanceof Ec2Client)
    })

    it('sets context value based on status', async function () {
        const stoppedInstance = { ...testInstance, status: 'stopped' }
        testNode.updateInstance(stoppedInstance)
        assert.strictEqual(testNode.contextValue, Ec2InstanceStoppedContext)

        const runningInstance = { ...testInstance, status: 'running' }
        testNode.updateInstance(runningInstance)
        assert.strictEqual(testNode.contextValue, Ec2InstanceRunningContext)

        const pendingInstance = { ...testInstance, status: 'pending' }
        testNode.updateInstance(pendingInstance)
        assert.strictEqual(testNode.contextValue, Ec2InstancePendingContext)
    })

    it('updates label with new instance', async function () {
        const newIdInstance = { ...testInstance, InstanceId: 'testId2' }
        testNode.updateInstance(newIdInstance)
        assert.strictEqual(testNode.label, `${getNameOfInstance(newIdInstance)} (${newIdInstance.InstanceId})`)
    })
})
