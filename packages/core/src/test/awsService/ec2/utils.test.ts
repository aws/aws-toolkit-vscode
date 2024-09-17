/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { Ec2Client, SafeEc2Instance } from '../../../shared/clients/ec2Client'
import { getConnectionManager, getIconCode, getSelection, refreshExplorerNode } from '../../../awsService/ec2/utils'
import { Ec2InstanceNode } from '../../../awsService/ec2/explorer/ec2InstanceNode'
import { Ec2ParentNode } from '../../../awsService/ec2/explorer/ec2ParentNode'
import { Ec2Prompter, Ec2Selection } from '../../../awsService/ec2/prompter'
import { Ec2ConnectionManagerMap } from '../../../awsService/ec2/activation'
import { Ec2ConnectionManager } from '../../../awsService/ec2/model'

const testInstance = {
    InstanceId: 'testId',
    Tags: [
        {
            Key: 'Name',
            Value: 'testName',
        },
    ],
    LastSeenStatus: 'running',
}
const testClient = new Ec2Client('')
const testParentNode = new Ec2ParentNode('fake-region', 'testPartition', testClient)
const testNode = new Ec2InstanceNode(testParentNode, testClient, 'testRegion', 'testPartition', testInstance)

describe('getIconCode', function () {
    it('gives code based on status', function () {
        const runningInstance: SafeEc2Instance = {
            InstanceId: 'X',
            LastSeenStatus: 'running',
        }
        const stoppedInstance: SafeEc2Instance = {
            InstanceId: 'XX',
            LastSeenStatus: 'stopped',
        }

        assert.strictEqual(getIconCode(runningInstance), 'pass')
        assert.strictEqual(getIconCode(stoppedInstance), 'circle-slash')
    })

    it('defaults to loading~spin', function () {
        const pendingInstance: SafeEc2Instance = {
            InstanceId: 'X',
            LastSeenStatus: 'pending',
        }
        const stoppingInstance: SafeEc2Instance = {
            InstanceId: 'XX',
            LastSeenStatus: 'shutting-down',
        }

        assert.strictEqual(getIconCode(pendingInstance), 'loading~spin')
        assert.strictEqual(getIconCode(stoppingInstance), 'loading~spin')
    })
})

describe('refreshExplorerNode', function () {
    after(function () {
        sinon.restore()
    })

    it('refreshes only parent node', function () {
        const parentRefresh = sinon.stub(Ec2ParentNode.prototype, 'refreshNode')
        const childRefresh = sinon.stub(Ec2InstanceNode.prototype, 'refreshNode')

        refreshExplorerNode(testNode)
        sinon.assert.calledOn(parentRefresh, testParentNode)

        parentRefresh.resetHistory()

        refreshExplorerNode(testParentNode)
        sinon.assert.calledOn(parentRefresh, testParentNode)

        sinon.assert.notCalled(childRefresh)
    })
})

describe('getSelection', async function () {
    it('uses node when passed', async function () {
        const prompterStub = sinon.stub(Ec2Prompter.prototype, 'promptUser')
        const result = await getSelection(testNode)

        assert.strictEqual(result, testNode.toSelection())
        sinon.assert.notCalled(prompterStub)
    })

    it('prompts user when no node is passed', async function () {
        const prompterStub = sinon.stub(Ec2Prompter.prototype, 'promptUser')
        await getSelection()
        sinon.assert.calledOnce(prompterStub)
    })
})

describe('getConnectionManager', async function () {
    let connectionManagers: Ec2ConnectionManagerMap

    beforeEach(function () {
        connectionManagers = new Map<string, Ec2ConnectionManager>()
    })

    it('only creates new connection managers once for each region ', async function () {
        const fakeSelection: Ec2Selection = {
            region: 'region-1',
            instanceId: 'fake-id',
        }

        const cm = await getConnectionManager(connectionManagers, fakeSelection)
        assert.strictEqual(connectionManagers.size, 1)

        cm.addActiveEnv('test-env')

        const cm2 = await getConnectionManager(connectionManagers, fakeSelection)

        assert.strictEqual(cm2.getActiveEnvs().size, 1)
    })
})
