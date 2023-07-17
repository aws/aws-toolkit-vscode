/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Ec2InstanceNode } from '../../../ec2/explorer/ec2InstanceNode'
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
            status: 'testing',
        }
        const testClient = new Ec2Client('')
        const testParentNode = new Ec2ParentNode(testRegion, testPartition, testClient)
        testNode = new Ec2InstanceNode(testParentNode, testClient, 'testRegion', 'testPartition', testInstance)
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
})
